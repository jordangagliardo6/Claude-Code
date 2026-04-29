/**
 * First-run setup and connection verifier
 *
 * Run this BEFORE starting the scheduler for the first time:
 *   node setup.js
 *
 * It will:
 *   1. Check all required environment variables are present
 *   2. Test the Apollo.io API key with a live people search
 *   3. Test Google Sheets access by reading the spreadsheet title
 *   4. Write the header row if the sheet is brand-new
 *   5. Confirm the cron schedule that will be used
 *
 * Fix any errors reported here before running `node index.js`.
 */

'use strict';

require('dotenv').config();

const { ApolloClient } = require('./src/apollo');
const { SheetsClient } = require('./src/sheets');
const logger = require('./src/logger');

// ── Helpers ───────────────────────────────────────────────────────────────────

function pass(label) { console.log(`  ✓  ${label}`); }
function fail(label, detail) { console.error(`  ✗  ${label}\n       ${detail}`); }
function section(title) { console.log(`\n── ${title} ${'─'.repeat(50 - title.length)}`); }

// ── Checks ────────────────────────────────────────────────────────────────────

async function checkEnvVars() {
  section('Environment Variables');

  const required = {
    APOLLO_API_KEY:    'Apollo.io API key',
    SPREADSHEET_ID:    'Google Sheets spreadsheet ID',
  };

  const optional = {
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE: 'Path to Google service-account JSON key (recommended)',
    MAX_LEADS_PER_RUN: `Max leads per run (default: 25, currently: ${process.env.MAX_LEADS_PER_RUN || '25'})`,
    CRON_SCHEDULE:     `Cron expression (default: 0 7 * * *, currently: ${process.env.CRON_SCHEDULE || '0 7 * * *'})`,
    TZ:                `Timezone (default: America/New_York, currently: ${process.env.TZ || 'not set'})`,
    ALERT_EMAIL_TO:    'Alert email recipient',
    ALERT_EMAIL_FROM:  'Gmail sender address',
    ALERT_EMAIL_PASS:  'Gmail App Password',
    SHEET_TAB_NAME:    `Sheet tab name (default: Leads, currently: ${process.env.SHEET_TAB_NAME || 'Leads'})`,
  };

  let allOk = true;

  for (const [key, desc] of Object.entries(required)) {
    if (process.env[key]) {
      pass(`${key} — ${desc}`);
    } else {
      fail(`${key} — ${desc}`, 'NOT SET — this is required');
      allOk = false;
    }
  }

  console.log('\n  Optional:');
  for (const [key, desc] of Object.entries(optional)) {
    if (process.env[key]) {
      pass(`${key} — ${desc}`);
    } else {
      console.log(`  ○  ${key} — ${desc}`);
    }
  }

  return allOk;
}

async function checkApollo() {
  section('Apollo.io API');

  if (!process.env.APOLLO_API_KEY) {
    fail('Apollo API', 'APOLLO_API_KEY not set — skipping');
    return false;
  }

  try {
    const apollo = new ApolloClient(process.env.APOLLO_API_KEY);
    const leads = await apollo.searchLeads(3, 1);
    pass(`Connected to Apollo.io API`);
    pass(`Sample search returned ${leads.length} result(s) with phone numbers`);

    if (leads.length > 0) {
      console.log('\n  Sample lead preview:');
      const l = leads[0];
      console.log(`    Business: ${l.businessName || '(blank)'}`);
      console.log(`    Contact:  ${l.firstName} ${l.lastName}`);
      console.log(`    Phone:    ${l.phone}`);
      console.log(`    City:     ${l.city}`);
      console.log(`    Website:  ${l.website || '(none)'}`);
    } else {
      console.log('  ⚠  No leads returned — this may mean Apollo has no results for the current');
      console.log('     filters, or your account needs the People Search feature enabled.');
    }
    return true;
  } catch (err) {
    fail('Apollo.io API', err.message);
    if (err.message.includes('401') || err.message.includes('403')) {
      console.log('       → Check that APOLLO_API_KEY is correct and active.');
    }
    return false;
  }
}

async function checkSheets() {
  section('Google Sheets API');

  if (!process.env.SPREADSHEET_ID) {
    fail('Google Sheets', 'SPREADSHEET_ID not set — skipping');
    return false;
  }

  const hasServiceAccount = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  const hasOAuth = require('fs').existsSync('./credentials/oauth_credentials.json');

  if (!hasServiceAccount && !hasOAuth) {
    fail(
      'Google auth',
      'No auth method found. You need either:\n' +
      '       A) Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE to a service-account JSON key, OR\n' +
      '       B) Place OAuth credentials at credentials/oauth_credentials.json'
    );
    console.log('\n  Service Account setup (recommended for automation):');
    console.log('    1. Go to https://console.cloud.google.com/');
    console.log('    2. Enable Google Sheets API for your project');
    console.log('    3. Create a service account under IAM → Service Accounts');
    console.log('    4. Download the JSON key and set GOOGLE_SERVICE_ACCOUNT_KEY_FILE=<path>');
    console.log('    5. Share your spreadsheet with the service account email address\n');
    return false;
  }

  try {
    const sheets = new SheetsClient(process.env.SPREADSHEET_ID);
    const title = await sheets.testConnection();
    pass(`Connected to Google Sheets API`);
    pass(`Spreadsheet found: "${title}"`);
    await sheets.ensureHeader();
    pass(`Header row verified`);
    return true;
  } catch (err) {
    fail('Google Sheets API', err.message);
    if (err.message.includes('not found') || err.message.includes('404')) {
      console.log('       → Double-check SPREADSHEET_ID is correct.');
    } else if (err.message.includes('403') || err.message.includes('permission')) {
      console.log('       → Share the spreadsheet with your service account email, or re-authorize OAuth.');
    }
    return false;
  }
}

function showScheduleSummary() {
  section('Schedule');
  const schedule = process.env.CRON_SCHEDULE || '0 7 * * *';
  const tz = process.env.TZ || 'America/New_York';
  pass(`Cron expression: ${schedule}`);
  pass(`Timezone: ${tz}`);
  pass(`Runs: daily at 7:00 AM Eastern Time`);
  pass(`Max leads per run: ${process.env.MAX_LEADS_PER_RUN || 25}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║     Lead Gen Workflow — First-Run Setup Check        ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const envOk     = await checkEnvVars();
  const apolloOk  = await checkApollo();
  const sheetsOk  = await checkSheets();
  showScheduleSummary();

  console.log('\n── Summary ' + '─'.repeat(51));

  if (envOk && apolloOk && sheetsOk) {
    console.log('\n  ✅  All checks passed! You are ready to start the workflow.');
    console.log('\n  Next steps:');
    console.log('    • Run once manually to confirm:  npm run run-now');
    console.log('    • Start the daily scheduler:     node index.js');
    console.log('    • Keep it running (Linux):       pm2 start index.js --name lead-gen');
    console.log('    • View logs:                     ls logs/\n');
  } else {
    console.log('\n  ❌  Some checks failed. Fix the issues above, then re-run: node setup.js\n');
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error(`Setup script crashed: ${err.message}`);
  process.exit(1);
});
