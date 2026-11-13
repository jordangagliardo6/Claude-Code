/**
 * HVAC Lead Generator — main entry point.
 *
 * Runs on schedule (7am Eastern daily) and can also be triggered immediately
 * with:  node src/index.js --run-now
 *
 * Required env vars (see .env.example):
 *   APOLLO_API_KEY, GOOGLE_SPREADSHEET_ID
 *
 * Required files (see credentials.json.example):
 *   credentials.json  — Google OAuth2 desktop app credentials
 */

require('dotenv').config();

const cron = require('node-cron');
const { searchHvacLeads } = require('./apollo');
const { getAuthClient, appendLeads } = require('./sheets');
const { logError, logSuccess } = require('./notify');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const APOLLO_KEY     = process.env.APOLLO_API_KEY;
const SHEET_NAME     = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
const MAX_LEADS      = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// ── Validation ────────────────────────────────────────────────────────────────

function validateConfig() {
  const missing = [];
  if (!APOLLO_KEY)      missing.push('APOLLO_API_KEY');
  if (!SPREADSHEET_ID)  missing.push('GOOGLE_SPREADSHEET_ID');

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Copy .env.example → .env and fill in the values.'
    );
  }
}

// ── Core job ──────────────────────────────────────────────────────────────────

async function runLeadJob() {
  console.log('\n========================================');
  console.log(` HVAC Lead Job started at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log('========================================\n');

  // 1. Search Apollo
  let leads;
  try {
    console.log(`Searching Apollo for up to ${MAX_LEADS} HVAC leads in SW Michigan...`);
    leads = await searchHvacLeads(APOLLO_KEY, MAX_LEADS);
    console.log(`Apollo returned ${leads.length} qualifying lead(s).\n`);
  } catch (err) {
    logError('Apollo search', err);
    console.error('Aborting — could not fetch leads from Apollo.');
    return;
  }

  if (leads.length === 0) {
    logError('Apollo search', new Error('Apollo returned 0 results for all cities. Check filters or API key quota.'));
    console.warn('No leads found this run.');
    return;
  }

  // 2. Write to Google Sheets
  let auth;
  try {
    console.log('Connecting to Google Sheets...');
    auth = await getAuthClient();
  } catch (err) {
    logError('Google auth', err);
    console.error('Aborting — could not authenticate with Google.');
    return;
  }

  let result;
  try {
    console.log(`Appending to spreadsheet (${SHEET_NAME})...`);
    result = await appendLeads(auth, SPREADSHEET_ID, SHEET_NAME, leads);
  } catch (err) {
    logError('Google Sheets write', err);
    console.error('Aborting — could not write to spreadsheet.');
    return;
  }

  logSuccess(result.added, result.skipped);
  console.log(`\nDone. Added ${result.added} new lead(s), skipped ${result.skipped} duplicate(s).`);
  console.log('========================================\n');
}

// ── Entry points ──────────────────────────────────────────────────────────────

validateConfig();

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // Manual / test run
  runLeadJob().catch((err) => {
    logError('Unhandled error', err);
    process.exit(1);
  });
} else {
  // Scheduled run: 7:00 AM Eastern Time every day
  // node-cron runs in local server time; use TZ env var if needed.
  // If your server is NOT in ET, set TZ=America/New_York in your environment.
  const CRON_SCHEDULE = '0 7 * * *';
  const TZ = 'America/New_York';

  console.log(`Scheduler started. Next run at 7:00 AM ET (cron: "${CRON_SCHEDULE}", tz: ${TZ})`);
  console.log('Press Ctrl+C to stop.\n');

  cron.schedule(CRON_SCHEDULE, () => {
    runLeadJob().catch((err) => logError('Unhandled error in scheduled job', err));
  }, { timezone: TZ });
}
