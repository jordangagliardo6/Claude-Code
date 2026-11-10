/**
 * HVAC Lead Generation — Main entry point
 *
 * Runs on a cron schedule (default 7am ET every day) to:
 *  1. Query Apollo.io for HVAC contacts in Southwest Michigan
 *  2. Append new leads to a Google Sheets spreadsheet
 *  3. Skip duplicates (checked against Business Name column)
 *  4. Alert on errors via console + optional email
 *
 * Usage:
 *   node src/index.js            → starts the cron scheduler
 *   node src/index.js --run-now  → skips the schedule, runs once immediately
 */

require('dotenv').config();
const cron = require('node-cron');
const { searchHvacLeads } = require('./apollo');
const { getSheetsClient, appendLeads } = require('./sheets');
const { notifyError, logSuccess } = require('./notify');

// ── Config ────────────────────────────────────────────────────────────────────

const {
  APOLLO_API_KEY,
  SPREADSHEET_ID,
  SHEET_NAME = 'Sheet1',
  GOOGLE_CREDENTIALS_PATH = './credentials.json',
  MAX_LEADS_PER_RUN = '25',
  // Default: 7:00 AM Eastern = 12:00 UTC (UTC-5 in EST, UTC-4 in EDT)
  // Adjust this for Daylight Saving Time: use "0 11 * * *" during EDT (summer)
  CRON_SCHEDULE = '0 12 * * *',
} = process.env;

const maxLeads = parseInt(MAX_LEADS_PER_RUN, 10) || 25;

// ── Main workflow ─────────────────────────────────────────────────────────────

/**
 * Core lead generation run — called by the cron job or --run-now flag.
 */
async function runLeadGen() {
  console.log(`\n[${new Date().toISOString()}] Starting HVAC lead gen run...`);

  // Validate required env vars before making any API calls
  if (!APOLLO_API_KEY) {
    await notifyError('Missing APOLLO_API_KEY', 'Set APOLLO_API_KEY in your .env file.');
    return;
  }
  if (!SPREADSHEET_ID) {
    await notifyError('Missing SPREADSHEET_ID', 'Set SPREADSHEET_ID in your .env file.');
    return;
  }

  let apolloResult;

  // ── Step 1: Search Apollo.io ──────────────────────────────────────────────
  try {
    console.log(`  Querying Apollo.io for up to ${maxLeads} HVAC leads...`);
    apolloResult = await searchHvacLeads(APOLLO_API_KEY, maxLeads);

    if (!apolloResult.contacts.length) {
      await notifyError(
        'Apollo returned 0 results',
        `The search returned no contacts with phone numbers.\n` +
        `Total matches reported by Apollo: ${apolloResult.totalResults}\n\n` +
        `Possible causes:\n` +
        `  • API key quota exhausted\n` +
        `  • No contacts match the current filters\n` +
        `  • Apollo's index has no phone numbers for this area\n\n` +
        `Try widening the city list in src/apollo.js or adjusting the title filters.`
      );
      return;
    }

    console.log(`  Apollo returned ${apolloResult.contacts.length} contacts with phone numbers.`);
  } catch (err) {
    const statusCode = err.response?.status;
    const detail = err.response?.data
      ? JSON.stringify(err.response.data, null, 2)
      : err.message;

    await notifyError(
      `Apollo API error (HTTP ${statusCode || 'unknown'})`,
      `Failed to fetch leads from Apollo.io.\n\nResponse:\n${detail}`
    );
    return;
  }

  // ── Step 2: Write to Google Sheets ────────────────────────────────────────
  let sheets;
  try {
    console.log('  Connecting to Google Sheets...');
    sheets = await getSheetsClient(GOOGLE_CREDENTIALS_PATH);
  } catch (err) {
    await notifyError(
      'Google Sheets auth failed',
      `Could not authenticate with Google Sheets.\n\n` +
      `Check that:\n` +
      `  • ${GOOGLE_CREDENTIALS_PATH} exists and is valid service account JSON\n` +
      `  • The service account has Editor access to spreadsheet: ${SPREADSHEET_ID}\n\n` +
      `Error: ${err.message}`
    );
    return;
  }

  let result;
  try {
    console.log(`  Appending leads to sheet "${SHEET_NAME}"...`);
    result = await appendLeads(sheets, SPREADSHEET_ID, SHEET_NAME, apolloResult.contacts);
  } catch (err) {
    await notifyError(
      'Google Sheets write failed',
      `Could not write to spreadsheet ${SPREADSHEET_ID}.\n\n` +
      `Error: ${err.message}\n\nStack:\n${err.stack}`
    );
    return;
  }

  // ── Step 3: Log results ───────────────────────────────────────────────────
  logSuccess({
    appended: result.appended,
    skipped: result.skipped,
    totalFromApollo: apolloResult.contacts.length,
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // Immediate single run — useful for testing and first-time setup verification
  runLeadGen().catch((err) => {
    console.error('Unhandled error in runLeadGen:', err);
    process.exit(1);
  });
} else {
  // Scheduled mode
  console.log('==============================================');
  console.log(' HVAC Lead Gen — Scheduler starting');
  console.log(`  Schedule : ${CRON_SCHEDULE} (UTC)`);
  console.log(`  Max leads: ${maxLeads} per run`);
  console.log(`  Sheet    : ${SPREADSHEET_ID} / ${SHEET_NAME}`);
  console.log('  Run "node src/index.js --run-now" to test immediately');
  console.log('==============================================\n');

  cron.schedule(CRON_SCHEDULE, () => {
    runLeadGen().catch((err) => {
      notifyError('Unhandled scheduler error', err);
    });
  });

  console.log('Scheduler is running. Press Ctrl+C to stop.\n');
}
