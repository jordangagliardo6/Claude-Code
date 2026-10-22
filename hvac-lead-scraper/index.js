/**
 * HVAC Lead Scraper — main entry point
 *
 * What this does:
 *   1. Searches Apollo.io for HVAC owner-operated businesses in Southwest Michigan
 *   2. Deduplicates against your Google Sheet
 *   3. Appends up to MAX_LEADS_PER_RUN new rows
 *   4. Runs automatically at 7:00 AM Eastern every day via node-cron
 *
 * Usage:
 *   node index.js              → start the scheduler (keeps running)
 *   node index.js --run-now   → run once immediately (for testing)
 *   node index.js --verify    → test both API connections without pulling leads
 */

require('dotenv').config(); // Load .env from the same directory

const cron = require('node-cron');
const { searchHvacLeads, verifyApolloConnection } = require('./apollo');
const { getExistingBusinessNames, appendLeads, verifySheetConnection } = require('./sheets');
const { notify } = require('./notifier');

// ── Customization points ──────────────────────────────────────────────────────

// Cities to search. Edit this list to target different areas.
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

// Maximum new leads to add per scheduled run.
// Keeping this low (25) prevents the sheet from being overwhelmed.
const MAX_LEADS_PER_RUN = 25;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core scraper logic: pull leads from Apollo, deduplicate, write to sheet.
 */
async function runLeadScraper() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ── Starting HVAC lead scraper run ──`);

  try {
    // Step 1: Load existing business names from the sheet
    console.log('Reading existing leads from Google Sheet…');
    const existingNames = await getExistingBusinessNames();
    console.log(`  → ${existingNames.size} existing businesses found (will skip duplicates)`);

    // Step 2: Search Apollo for new leads
    console.log(`Searching Apollo.io for HVAC leads in: ${TARGET_CITIES.join(', ')}…`);
    const leads = await searchHvacLeads(TARGET_CITIES, MAX_LEADS_PER_RUN, existingNames);

    if (leads.length === 0) {
      console.log('No new leads found this run. Apollo may have returned no results, or all matches are already in the sheet.');
      console.log('Try adjusting TARGET_CITIES or TARGET_INDUSTRIES in apollo.js.');
      return;
    }

    // Step 3: Append new leads to the sheet
    console.log(`Found ${leads.length} new lead(s). Writing to Google Sheet…`);
    await appendLeads(leads);

    console.log(`✓ Run complete — ${leads.length} lead(s) added to your sheet.`);
    leads.forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.businessName} (${l.city}) — ${l.ownerFirstName} ${l.ownerLastName} — ${l.phone}`);
    });
  } catch (error) {
    const errorMessage = `Run failed: ${error.message}`;
    console.error(`\n[${new Date().toISOString()}] ${errorMessage}`);
    console.error(error.stack);
    await notify(errorMessage); // Send email alert if configured
  }
}

/**
 * Verify both API connections before the first scheduled run.
 * Exits with a non-zero code if either check fails.
 */
async function runVerification() {
  console.log('\n── HVAC Lead Scraper — Connection Verification ──\n');
  let allOk = true;

  // 1. Apollo.io
  process.stdout.write('1. Apollo.io API key … ');
  try {
    const result = await verifyApolloConnection();
    console.log(`✓  Connected (${result.totalRecords} total records accessible)`);
  } catch (err) {
    console.log(`✗  FAILED: ${err.message}`);
    allOk = false;
  }

  // 2. Google Sheets
  process.stdout.write('2. Google Sheet access … ');
  try {
    const result = await verifySheetConnection();
    console.log(`✓  Connected — sheet: "${result.title}"`);
  } catch (err) {
    console.log(`✗  FAILED: ${err.message}`);
    allOk = false;
  }

  console.log('');
  if (allOk) {
    console.log('✓ All checks passed. You\'re ready to run the scraper.\n');
    console.log('  → Run now:       node index.js --run-now');
    console.log('  → Start cron:    node index.js\n');
  } else {
    console.log('✗ One or more checks failed. See SETUP.md for configuration steps.\n');
    process.exit(1);
  }
}

// ── CLI flag handling ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--verify')) {
  runVerification();
} else if (args.includes('--run-now')) {
  // Run once immediately (no scheduler)
  runLeadScraper().then(() => process.exit(0)).catch(() => process.exit(1));
} else {
  // Start the daily scheduler
  // node-cron with timezone: 'America/New_York' handles EST ↔ EDT automatically.
  // Fires at exactly 7:00 AM Eastern regardless of daylight saving.
  cron.schedule('0 7 * * *', runLeadScraper, {
    timezone: 'America/New_York',
  });

  console.log('HVAC Lead Scraper started.');
  console.log('  Scheduled: 7:00 AM Eastern Time, every day');
  console.log('  Cities:   ', TARGET_CITIES.join(', '));
  console.log('  Max leads per run:', MAX_LEADS_PER_RUN);
  console.log('\nProcess is running. Press Ctrl+C to stop.\n');
}
