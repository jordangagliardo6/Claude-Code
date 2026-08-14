require('dotenv').config();
const ApolloClient = require('./apolloClient');
const SheetsManager = require('./sheetsManager');
const { sendErrorNotification } = require('./notifier');
const config = require('./config');

// Parse Google credentials from env.
// Supports both inline JSON (GOOGLE_CREDENTIALS_JSON) and a file path (GOOGLE_CREDENTIALS_FILE).
function loadGoogleCredentials() {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  }
  if (process.env.GOOGLE_CREDENTIALS_FILE) {
    return require(require('path').resolve(process.env.GOOGLE_CREDENTIALS_FILE));
  }
  throw new Error(
    'No Google credentials found. ' +
    'Set GOOGLE_CREDENTIALS_JSON or GOOGLE_CREDENTIALS_FILE in your .env file.'
  );
}

// Extract the best available phone number from an Apollo person record.
// Prefers mobile/direct lines; falls back to the first number in the list.
function extractPhone(person) {
  const phones = person.phone_numbers || [];
  if (!phones.length) return '';
  const preferred = phones.find(p => ['mobile', 'direct_phone'].includes(p.type));
  const pick = preferred || phones[0];
  return pick.raw_number || pick.sanitized_number || pick.number || '';
}

// Try to match a Southwest Michigan city from the person's or company's location fields.
// Falls back to the raw city or 'Michigan' if no match.
function resolveCity(person, targetCities) {
  const candidates = [
    person.city,
    person.present_raw_address,
    person.organization?.city,
    person.organization?.raw_address,
  ].filter(Boolean).join(' ');

  for (const city of targetCities) {
    if (candidates.toLowerCase().includes(city.toLowerCase())) return city;
  }

  // Return whatever city Apollo reports even if not in our target list
  return person.organization?.city || person.city || 'Michigan';
}

// Main workflow — called once per cron tick (or manually via npm run run-now).
async function runWorkflow() {
  const startTime = new Date();
  console.log(`\n[${startTime.toISOString()}] ── HVAC Lead Generator run started ──`);

  // ── Initialise clients ──────────────────────────────────────────────────
  const apollo = new ApolloClient(process.env.APOLLO_API_KEY);
  const sheets = new SheetsManager({
    spreadsheetId: config.spreadsheetId,
    sheetName: config.sheetName,
    credentials: loadGoogleCredentials(),
  });

  // ── Step 1: load existing business names to prevent duplicates ───────────
  let existingNames;
  try {
    existingNames = await sheets.getExistingBusinessNames();
    console.log(`  Existing sheet entries: ${existingNames.size}`);
  } catch (err) {
    const msg = `Could not read the spreadsheet: ${err.message}`;
    console.error(msg);
    await sendErrorNotification('Spreadsheet Read Error', msg);
    return { added: 0, error: msg };
  }

  // ── Step 2: search Apollo ───────────────────────────────────────────────
  let searchData;
  try {
    searchData = await apollo.searchPeople({
      personTitles: config.apollo.personTitles,
      employeeRanges: config.apollo.employeeRanges,
      naicsCodes: config.apollo.naicsCodes,
      personLocations: config.apollo.personLocations,
      organizationLocations: config.apollo.organizationLocations,
      keywords: config.apollo.keywords,
      perPage: 50,
    });
  } catch (err) {
    const msg = `Apollo search failed: ${err.response?.data?.message || err.message}`;
    console.error(msg);
    await sendErrorNotification('Apollo Search Error', msg);
    return { added: 0, error: msg };
  }

  const rawPeople = searchData.people || [];
  const total = searchData.pagination?.total_entries || rawPeople.length;
  console.log(`  Apollo returned ${rawPeople.length} contacts (${total} total in database)`);

  if (!rawPeople.length) {
    const msg = 'Apollo returned 0 results for the current search criteria.';
    console.warn(`  ${msg}`);
    await sendErrorNotification('Apollo: No Results', msg + '\nCheck your filters in src/config.js.');
    return { added: 0, error: msg };
  }

  // ── Step 3: identify new candidates (not already in sheet) ─────────────
  const candidates = rawPeople.filter(p => {
    const name = (p.organization?.name || '').toLowerCase().trim();
    return name && !existingNames.has(name);
  });
  console.log(`  New candidates after dedup check: ${candidates.length}`);

  // ── Step 4: enrich to get phone numbers ────────────────────────────────
  // Some Apollo plans return phones in the search result. Enrich only the
  // contacts that have no phone yet (saves credits).
  const needEnrichment = candidates.filter(p => !extractPhone(p));
  const hasPhone = candidates.filter(p => extractPhone(p));

  let enrichedMap = {};   // id → enriched person record
  if (needEnrichment.length) {
    console.log(`  Enriching ${needEnrichment.length} contacts for phone numbers (uses Apollo credits)...`);
    try {
      const enriched = await apollo.enrichWithPhones(needEnrichment.map(p => p.id));
      for (const ep of enriched) {
        if (ep.id) enrichedMap[ep.id] = ep;
      }
    } catch (err) {
      console.warn(`  Enrichment error (continuing with what we have): ${err.message}`);
    }
  }

  // Merge enriched data back into the candidate list
  const merged = candidates.map(p => {
    const enriched = enrichedMap[p.id];
    if (!enriched) return p;
    // Overlay enriched phone numbers onto the original record
    return { ...p, phone_numbers: enriched.phone_numbers || p.phone_numbers };
  });

  // ── Step 5: build lead rows, skip contacts with no phone ────────────────
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  const newLeads = [];
  const seen = new Set(existingNames);   // track within this run to prevent same-run dupes

  for (const person of merged) {
    if (newLeads.length >= config.apollo.maxLeadsPerRun) break;

    const businessName = (person.organization?.name || '').trim();
    if (!businessName || seen.has(businessName.toLowerCase())) continue;

    const phone = extractPhone(person);
    if (!phone) {
      console.log(`  Skipped (no phone): ${businessName} — ${person.name || 'unknown'}`);
      continue;
    }

    seen.add(businessName.toLowerCase());
    newLeads.push({
      dateAdded: today,
      businessName,
      ownerFirstName: person.first_name || '',
      ownerLastName: person.last_name || '',
      phoneNumber: phone,
      city: resolveCity(person, config.targetCities),
      website: person.organization?.website_url || person.organization?.primary_domain || '',
    });
  }

  console.log(`  Leads ready to add: ${newLeads.length}`);

  // ── Step 6: write to Google Sheet ───────────────────────────────────────
  if (!newLeads.length) {
    console.log('  Nothing to add — all contacts either lack phones or are already in the sheet.');
    return { added: 0 };
  }

  let added;
  try {
    added = await sheets.appendLeads(newLeads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    console.error(msg);
    await sendErrorNotification('Spreadsheet Write Error', msg);
    return { added: 0, error: msg };
  }

  const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
  console.log(`  ✅ Added ${added} leads in ${elapsed}s`);
  console.log(`[${new Date().toISOString()}] ── Run complete ──\n`);
  return { added };
}

module.exports = { runWorkflow };
