const config = require('./config');
const apollo = require('./apolloClient');
const sheets = require('./sheetsClient');
const notifier = require('./notifier');

// Pulls raw search hits across all configured cities and dedupes them by
// company name, keeping the highest title-priority match per company.
async function collectCandidates() {
  const { cities, resultsPerCityPage } = config.apollo;
  const byCompany = new Map();

  for (const city of cities) {
    const people = await apollo.searchPeopleInCity(city, resultsPerCityPage);
    for (const person of people) {
      const companyName = person.organization && person.organization.name;
      if (!companyName) continue;

      const key = companyName.trim().toLowerCase();
      const existing = byCompany.get(key);
      if (!existing || person._titleRank < existing._titleRank) {
        byCompany.set(key, { ...person, _city: city });
      }
    }
  }

  return Array.from(byCompany.values());
}

// Reveals phone numbers for candidates one at a time (Apollo bills per
// reveal) until we have enough leads with phone numbers, or we run out of
// candidates. Candidates with no revealable phone number are skipped.
async function enrichWithPhones(candidates, neededCount) {
  const enriched = [];

  for (const candidate of candidates) {
    if (enriched.length >= neededCount) break;

    const phone = await apollo.enrichPersonPhone(candidate.id);
    if (!phone) continue; // exclude contacts with no phone number

    enriched.push({ ...candidate, _phone: phone });
  }

  return enriched;
}

function toSheetRow(candidate) {
  const org = candidate.organization || {};
  return {
    'Date Added': new Date().toISOString().slice(0, 10),
    'Business Name': org.name || '',
    'Owner First Name': candidate.first_name || '',
    'Owner Last Name': candidate.last_name || '',
    'Phone Number': candidate._phone || '',
    'City': (candidate._city || '').split(',')[0].trim(),
    'Website': org.website_url || '',
    'Called': '',
    'Notes': '',
  };
}

async function run() {
  notifier.logInfo('Starting Apollo lead generation run.');

  let candidates;
  try {
    candidates = await collectCandidates();
  } catch (err) {
    await notifier.alert(
      'Apollo search failed',
      `The Apollo.io search request failed: ${err.message}\nCheck APOLLO_API_KEY and your Apollo plan's API access.`
    );
    notifier.logError('collectCandidates', err);
    return;
  }

  if (candidates.length === 0) {
    await notifier.alert(
      'Apollo returned no results',
      'The Apollo.io search returned zero matches across all configured cities. ' +
        'Check your filters in src/config.js (industry keywords, employee range, titles) ' +
        'or your Apollo plan/credit balance.'
    );
    return;
  }

  notifier.logInfo(`Found ${candidates.length} candidate companies before dedup/enrichment.`);

  let existingNames;
  try {
    await sheets.ensureHeaderRow();
    existingNames = await sheets.getExistingBusinessNames();
  } catch (err) {
    await notifier.alert(
      'Google Sheets read failed',
      `Could not read the existing leads sheet: ${err.message}\nCheck your Google OAuth setup and GOOGLE_SHEET_ID.`
    );
    notifier.logError('getExistingBusinessNames', err);
    return;
  }

  const newCandidates = candidates.filter((c) => {
    const name = (c.organization && c.organization.name || '').trim().toLowerCase();
    return name && !existingNames.has(name);
  });

  if (newCandidates.length === 0) {
    notifier.logInfo('No new leads -- every candidate company is already in the sheet.');
    return;
  }

  const { maxNewLeadsPerRun } = config.workflow;
  const bufferSize = maxNewLeadsPerRun * config.apollo.candidateBufferMultiplier;
  const pool = newCandidates.slice(0, bufferSize);

  let enriched;
  try {
    enriched = await enrichWithPhones(pool, maxNewLeadsPerRun);
  } catch (err) {
    await notifier.alert(
      'Apollo phone enrichment failed',
      `Phone number enrichment failed: ${err.message}\nCheck your Apollo plan's mobile/phone credit balance.`
    );
    notifier.logError('enrichWithPhones', err);
    return;
  }

  if (enriched.length === 0) {
    notifier.logInfo('No candidates had a revealable phone number this run. Nothing to add.');
    return;
  }

  const rows = enriched.map(toSheetRow);

  try {
    await sheets.appendLeads(rows);
  } catch (err) {
    await notifier.alert(
      'Google Sheets write failed',
      `Found ${rows.length} new leads but failed to write them to the sheet: ${err.message}`
    );
    notifier.logError('appendLeads', err);
    return;
  }

  notifier.logInfo(`Added ${rows.length} new lead(s) to the sheet.`);
}

module.exports = { run };
