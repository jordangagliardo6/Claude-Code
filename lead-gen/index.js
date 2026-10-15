/**
 * index.js — HVAC Lead Generation Workflow
 *
 * Pulls up to 25 new HVAC leads from Apollo.io and appends them to
 * a Google Sheet, skipping duplicates. Runs automatically at 7:00 AM
 * Eastern Time every day.
 *
 * Usage:
 *   node index.js               — start the daily scheduler
 *   node index.js --verify      — test Apollo + Google Sheets connections
 *   node index.js --run-now     — run immediately (skip scheduler)
 *   node index.js --init-sheet  — write the header row to a blank sheet
 */

require('dotenv').config();
const cron = require('node-cron');

const { searchHVACLeads } = require('./src/apolloSearch');
const {
  getExistingBusinessNames,
  appendLeads,
  initializeSheet,
  verifyConnection,
} = require('./src/googleSheets');
const { deduplicateLeads, mapLeadToRow } = require('./src/leadProcessor');
const { sendErrorAlert } = require('./src/notifications');

const MAX_LEADS_PER_RUN = 25; // Change to pull more or fewer leads per day
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

// ---------------------------------------------------------------
// Core workflow
// ---------------------------------------------------------------

async function runLeadGeneration() {
  const startTime = new Date();
  console.log(`\n[${ startTime.toISOString() }] ── Starting HVAC lead generation run ──`);

  try {
    // Step 1: Fetch candidates from Apollo (pull extra to cover dedup losses)
    console.log('  [1/4] Searching Apollo.io...');
    const candidates = await searchHVACLeads(MAX_LEADS_PER_RUN * 3);
    console.log(`        ${candidates.length} contacts returned with phone numbers`);

    if (candidates.length === 0) {
      const msg =
        'Apollo.io returned 0 results with phone numbers. ' +
        'Check your APOLLO_API_KEY or widen the search filters in src/apolloSearch.js.';
      console.error(`  [ERROR] ${msg}`);
      await sendErrorAlert('Apollo returned 0 results', msg);
      return;
    }

    // Step 2: Read existing business names from the sheet
    console.log('  [2/4] Reading existing sheet entries...');
    const existingNames = await getExistingBusinessNames(SPREADSHEET_ID);
    console.log(`        ${existingNames.size} businesses already in sheet`);

    // Step 3: Remove duplicates
    console.log('  [3/4] Deduplicating...');
    const newLeads = deduplicateLeads(candidates, existingNames);
    console.log(`        ${newLeads.length} new leads (${candidates.length - newLeads.length} duplicates removed)`);

    if (newLeads.length === 0) {
      console.log('  All results are already in the sheet — nothing to add today.');
      return;
    }

    // Step 4: Format and append (cap at MAX_LEADS_PER_RUN)
    const leadsToAdd = newLeads.slice(0, MAX_LEADS_PER_RUN);
    const rows = leadsToAdd.map(mapLeadToRow);

    console.log(`  [4/4] Appending ${rows.length} row(s) to Google Sheet...`);
    await appendLeads(SPREADSHEET_ID, rows);

    // Summary table
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n  ✓ Added ${rows.length} lead(s) in ${elapsed}s\n`);
    console.log('  Business Name'.padEnd(40) + 'Phone'.padEnd(18) + 'City');
    console.log('  ' + '─'.repeat(72));
    rows.forEach((r) => {
      console.log(`  ${String(r[1]).padEnd(40)}${String(r[4]).padEnd(18)}${r[5]}`);
    });

    console.log(`\n[${ new Date().toISOString() }] ── Run complete ──\n`);
  } catch (err) {
    const msg = `Run failed: ${err.message}`;
    console.error(`\n  [ERROR] ${msg}`);
    console.error(err.stack);
    await sendErrorAlert('Lead generation run failed', `${msg}\n\n${err.stack}`);
  }
}

// ---------------------------------------------------------------
// One-time setup: write header row to a blank sheet
// ---------------------------------------------------------------

async function handleInitSheet() {
  console.log('Initializing sheet headers...');
  try {
    await initializeSheet(SPREADSHEET_ID);
    console.log('Done. Open your spreadsheet to confirm the header row.');
  } catch (err) {
    console.error(`Init failed: ${err.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------
// Connection verification (run before first scheduled run)
// ---------------------------------------------------------------

async function verifyConnections() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   Connection Verification             ║');
  console.log('╚══════════════════════════════════════╝\n');

  let allOk = true;

  // Apollo.io
  process.stdout.write('  Apollo.io ............. ');
  try {
    const leads = await searchHVACLeads(1);
    console.log(`OK  (${leads.length} result(s) returned)`);
  } catch (err) {
    console.log(`FAIL\n               ${err.message}`);
    allOk = false;
  }

  // Google Sheets
  process.stdout.write('  Google Sheets ......... ');
  try {
    const title = await verifyConnection(SPREADSHEET_ID);
    console.log(`OK  ("${title}")`);
  } catch (err) {
    console.log(`FAIL\n               ${err.message}`);
    allOk = false;
  }

  console.log('');
  if (allOk) {
    console.log('  ✓ Both connections successful.\n');
    console.log('  Next steps:');
    console.log('    1. Run `npm run init-sheet` if your spreadsheet is empty.');
    console.log('    2. Run `npm start` to start the 7am ET daily scheduler.');
    console.log('    3. Or run `npm run run-now` to pull leads immediately.\n');
  } else {
    console.log('  ✗ One or more connections failed. Fix the errors above before scheduling.\n');
  }

  return allOk;
}

// ---------------------------------------------------------------
// Validate required env vars
// ---------------------------------------------------------------

function checkEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`\nMissing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in the values.\n');
    process.exit(1);
  }
}

// ---------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------

(async () => {
  checkEnv();
  const args = process.argv.slice(2);

  if (args.includes('--verify')) {
    await verifyConnections();
    process.exit(0);
  }

  if (args.includes('--init-sheet')) {
    await handleInitSheet();
    process.exit(0);
  }

  if (args.includes('--run-now')) {
    await runLeadGeneration();
    process.exit(0);
  }

  // Default: start the daily cron scheduler
  console.log('HVAC Lead Gen Workflow — scheduler starting');
  console.log('Cron: every day at 7:00 AM Eastern Time');
  console.log('Spreadsheet ID:', SPREADSHEET_ID);
  console.log('Press Ctrl+C to stop.\n');

  // 0 7 * * * = 7:00 AM every day
  cron.schedule('0 7 * * *', runLeadGeneration, {
    timezone: 'America/New_York',
  });
})();
