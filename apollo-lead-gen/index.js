'use strict';
require('dotenv').config();

const cron = require('node-cron');
const { searchPeople, enrichPeople, normalizePerson } = require('./src/apollo');
const { createSheetsClient, ensureHeaders, getExistingBusinessNames, appendLeads } = require('./src/sheets');
const { notifyError } = require('./src/notify');
const { MAX_LEADS_PER_RUN, CRON_SCHEDULE, TIMEZONE, CITY_NAMES } = require('./src/config');

// Returns true if the person's city is in or near Southwest Michigan.
// We do a soft match — if the city is unknown we allow it through rather
// than throwing away potentially valid Michigan leads.
function isInTargetArea(person) {
  const personState = (person._state || '').toLowerCase();
  // If state is known and isn't Michigan, exclude immediately
  if (personState && !['michigan', 'mi'].includes(personState)) return false;

  const city = (person.city || '').toLowerCase();
  if (!city) return true; // unknown city — allow through (state is Michigan or unknown)

  // Match if the person's city contains any of our target city names
  return CITY_NAMES.some(tc => city.includes(tc.toLowerCase()));
}

// ─── MAIN WORKFLOW ─────────────────────────────────────────────────────────────
async function run() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${ timestamp }] Starting HVAC lead gen run (max ${MAX_LEADS_PER_RUN} leads)...`);

  if (!process.env.APOLLO_API_KEY) throw new Error('APOLLO_API_KEY is not set.');
  if (!process.env.GOOGLE_SHEETS_ID) throw new Error('GOOGLE_SHEETS_ID is not set.');

  // ── 1. Connect to Google Sheets ──────────────────────────────────────────
  const sheets = createSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  await ensureHeaders(sheets, spreadsheetId);
  const existingNames = await getExistingBusinessNames(sheets, spreadsheetId);
  console.log(`Sheet has ${existingNames.size} existing businesses (will skip duplicates).`);

  // ── 2. Search Apollo ─────────────────────────────────────────────────────
  // Pull 2× the target so we have headroom after filtering no-phone and duplicates
  const candidates = await searchPeople(MAX_LEADS_PER_RUN * 2);
  console.log(`Apollo search returned ${candidates.length} candidates.`);

  if (candidates.length === 0) {
    console.log('No Apollo results. Run aborted — check your API key and filters.');
    return { added: 0, skipped: 0, reason: 'no_apollo_results' };
  }

  // ── 3. Enrich to reveal phone numbers ────────────────────────────────────
  // This uses direct-dial credits from your Apollo account.
  // Each newly revealed number costs 1 credit.
  const ids = candidates.map(p => p.id).filter(Boolean);
  let enriched = [];
  try {
    enriched = await enrichPeople(ids);
    console.log(`Enrichment returned data for ${enriched.length} contacts.`);
  } catch (err) {
    // Enrichment failing is non-fatal — fall back to whatever phones came in search results
    console.warn(`Enrichment failed (${err.message}). Using raw search results.`);
    enriched = candidates;
  }

  // Merge enriched data onto the original search results by ID
  const byId = Object.fromEntries(enriched.filter(p => p.id).map(p => [p.id, p]));
  const merged = candidates.map(p => (byId[p.id] ? { ...p, ...byId[p.id] } : p));

  // ── 4. Filter and normalize ──────────────────────────────────────────────
  const newLeads = [];
  let skipped = 0;

  for (const person of merged) {
    if (newLeads.length >= MAX_LEADS_PER_RUN) break;

    const lead = normalizePerson(person);

    if (!lead) { skipped++; continue; } // no phone or no business name

    if (existingNames.has(lead.businessName.toLowerCase())) {
      skipped++; continue; // already in the sheet
    }

    if (!isInTargetArea(lead)) {
      skipped++; continue; // outside SW Michigan
    }

    newLeads.push(lead);
    // Track in-memory so duplicates within this batch are also caught
    existingNames.add(lead.businessName.toLowerCase());
  }

  console.log(`New unique leads with phones: ${newLeads.length} | Filtered out: ${skipped}`);

  // ── 5. Write to Google Sheets ────────────────────────────────────────────
  const added = await appendLeads(sheets, spreadsheetId, newLeads);
  console.log(`Done. Added ${added} new leads to the sheet.`);

  return { added, skipped };
}

// ─── RUN WRAPPER ──────────────────────────────────────────────────────────────
async function runWithErrorHandling() {
  try {
    const result = await run();
    console.log(`Run complete — added: ${result.added}, skipped: ${result.skipped}\n`);
  } catch (err) {
    await notifyError(err);
  }
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────
// Pass --now on the command line to run immediately instead of waiting for cron.
// Example: node index.js --now
if (process.argv.includes('--now')) {
  runWithErrorHandling().then(() => process.exit(0));
} else {
  console.log(`Scheduler ready. Runs at 7:00 AM ${TIMEZONE} every day.`);
  console.log(`Schedule: "${CRON_SCHEDULE}" — use "node index.js --now" to run immediately.\n`);
  cron.schedule(CRON_SCHEDULE, runWithErrorHandling, { timezone: TIMEZONE });
}
