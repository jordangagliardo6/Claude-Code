/**
 * HVAC Lead Generation — SW Michigan
 *
 * Searches Apollo.io for HVAC decision-makers, deduplicates against an
 * existing Google Sheet, and appends up to 25 new leads per run.
 *
 * Usage:
 *   node index.js              — start the cron scheduler (7 am ET daily)
 *   node index.js --test       — verify Apollo.io + Google Sheets connection
 *   node index.js --run-now    — run once immediately, then exit
 *   node index.js --setup      — write header row to an empty sheet, then exit
 */

require('dotenv').config();
const cron = require('node-cron');

const { searchHVACLeads, testConnection: testApollo } = require('./apollo');
const {
  initSheetsClient,
  getExistingBusinessNames,
  appendLeads,
  ensureHeaderRow,
  testConnection: testSheets,
} = require('./sheets');
const { sendErrorNotification, logSuccess } = require('./notifier');

// ─── Configuration ────────────────────────────────────────────────────────────
// Edit MAX_LEADS_PER_RUN to pull more or fewer leads each morning.
const MAX_LEADS_PER_RUN = 25;

// Runs every day at 7:00 AM Eastern Time.
// Change the cron expression here if you want a different schedule.
const CRON_SCHEDULE = '0 7 * * *';
const CRON_TIMEZONE = 'America/New_York';
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  validateEnv();

  const sheets = await initSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const apolloKey = process.env.APOLLO_API_KEY;

  // ── Single-run modes ───────────────────────────────────────────────────────
  if (process.argv.includes('--test')) {
    await runConnectionTest(apolloKey, sheets, spreadsheetId);
    process.exit(0);
  }

  if (process.argv.includes('--setup')) {
    await ensureHeaderRow(sheets, spreadsheetId);
    console.log('\nSetup complete. Your sheet is ready.');
    process.exit(0);
  }

  if (process.argv.includes('--run-now')) {
    await runLeadJob(apolloKey, sheets, spreadsheetId);
    process.exit(0);
  }

  // ── Scheduled mode ─────────────────────────────────────────────────────────
  console.log(
    `Scheduler started. Runs every day at 7:00 AM ET (${CRON_SCHEDULE} ${CRON_TIMEZONE}).`
  );
  console.log('Tip: run "node index.js --run-now" to trigger a manual run.\n');

  cron.schedule(
    CRON_SCHEDULE,
    async () => {
      console.log('\n--- Scheduled run triggered ---');
      await runLeadJob(apolloKey, sheets, spreadsheetId);
    },
    { timezone: CRON_TIMEZONE }
  );
}

/**
 * Core job: fetch leads from Apollo, deduplicate, append to sheet.
 */
async function runLeadJob(apolloKey, sheets, spreadsheetId) {
  const startTime = Date.now();
  console.log(`Run started at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);

  // 1. Fetch leads from Apollo.io
  let rawLeads;
  try {
    rawLeads = await searchHVACLeads(apolloKey, MAX_LEADS_PER_RUN);
  } catch (err) {
    await sendErrorNotification('Apollo.io search failed', err);
    return;
  }

  if (!rawLeads || rawLeads.length === 0) {
    await sendErrorNotification(
      'Apollo returned no results',
      'The search returned 0 leads. The API key may be rate-limited, or no results match the current filters.'
    );
    return;
  }

  // Count leads Apollo dropped due to no phone number (already filtered in apollo.js)
  // We re-run to get the original total for logging
  const noPhoneCount = MAX_LEADS_PER_RUN - rawLeads.length;

  // 2. Load existing business names to detect duplicates
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets, spreadsheetId);
  } catch (err) {
    await sendErrorNotification('Could not read Google Sheet', err);
    return;
  }

  // 3. Filter out duplicates (case-insensitive match on business name)
  const newLeads = [];
  let duplicateCount = 0;

  for (const lead of rawLeads) {
    if (existingNames.has(lead.businessName.toLowerCase().trim())) {
      duplicateCount++;
    } else {
      newLeads.push(lead);
    }
  }

  console.log(`${rawLeads.length} lead(s) with phone numbers, ${duplicateCount} duplicate(s), ${newLeads.length} new`);

  if (newLeads.length === 0) {
    console.log('Nothing new to add this run.');
    logSuccess(0, duplicateCount, noPhoneCount);
    return;
  }

  // 4. Append new leads to the sheet
  try {
    const added = await appendLeads(sheets, spreadsheetId, newLeads);
    logSuccess(added, duplicateCount, noPhoneCount);
  } catch (err) {
    await sendErrorNotification('Google Sheet write failed', err);
    return;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s.`);
}

/**
 * --test mode: verify both API connections without touching the sheet data.
 */
async function runConnectionTest(apolloKey, sheets, spreadsheetId) {
  console.log('\n=== Connection Test ===\n');

  // Test Apollo.io
  process.stdout.write('1. Apollo.io API key ... ');
  try {
    await testApollo(apolloKey);
    console.log('✓ Connected');
  } catch (err) {
    console.log('✗ FAILED');
    console.error(`   ${err.message}`);
    if (err.response?.status === 401) {
      console.error('   → API key is invalid or expired.');
    } else if (err.response?.status === 429) {
      console.error('   → Rate limit hit. Wait a moment and retry.');
    }
  }

  // Test Google Sheets
  process.stdout.write('2. Google Sheets access ... ');
  try {
    await testSheets(sheets, spreadsheetId);
    console.log('✓ Connected');
  } catch (err) {
    console.log('✗ FAILED');
    console.error(`   ${err.message}`);
    if (err.message.includes('not found') || err.code === 404) {
      console.error('   → Spreadsheet ID not found. Check GOOGLE_SHEETS_ID in .env');
    } else if (err.message.includes('permission') || err.code === 403) {
      console.error('   → Permission denied. Share the sheet with your service account email.');
    }
  }

  console.log('\nTo write the header row to an empty sheet, run: node index.js --setup');
  console.log('To run the lead job right now, run:         node index.js --run-now\n');
}

/**
 * Fail fast if required env vars are missing before hitting any APIs.
 */
function validateEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SHEETS_ID'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in your values.');
    process.exit(1);
  }
}

main().catch(async (err) => {
  await sendErrorNotification('Startup error', err);
  process.exit(1);
});
