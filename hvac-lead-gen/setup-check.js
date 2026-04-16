// ─────────────────────────────────────────────────────────────────────────────
// setup-check.js — First-run connection verifier
// Run this BEFORE starting the scheduler to confirm everything is wired up:
//   npm run setup-check
//
// Checks:
//   ✓ .env file is loaded and required vars are present
//   ✓ Apify API token is valid and the scraper actor exists
//   ✓ Google service account credentials are readable
//   ✓ Google Sheets spreadsheet is accessible
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const { testConnection: apifyTest  } = require('./apify');
const { testConnection: sheetsTest } = require('./sheets');
const config                         = require('./config');

const PASS = '  ✓';
const FAIL = '  ✗';
const WARN = '  ⚠';

async function main() {
  let allPassed = true;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  HVAC Lead Gen — Setup Check                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // ── 1. Environment variables ───────────────────────────────────────────────

  console.log('[ 1 ] Environment Variables');

  const checks = [
    { key: 'APIFY_API_TOKEN',       label: 'APIFY_API_TOKEN'       },
    { key: 'GOOGLE_SPREADSHEET_ID', label: 'GOOGLE_SPREADSHEET_ID' },
    {
      key  : '_GOOGLE_CREDS',
      label: 'Google credentials (KEY_FILE or JSON)',
      value: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    },
  ];

  for (const c of checks) {
    const val = c.value !== undefined ? c.value : process.env[c.key];
    if (val) {
      const preview = val.length > 50 ? val.slice(0, 50) + '…' : val;
      console.log(`${PASS} ${c.label}: ${preview}`);
    } else {
      console.log(`${FAIL} ${c.label} is NOT set`);
      allPassed = false;
    }
  }

  if (config.notificationEmail) {
    console.log(`${PASS} NOTIFICATION_EMAIL: ${config.notificationEmail}`);
  } else {
    console.log(`${WARN} NOTIFICATION_EMAIL not set (errors will only appear in console)`);
  }

  console.log('');

  // ── 2. Apify connection ────────────────────────────────────────────────────

  console.log('[ 2 ] Apify (Google Maps Scraper)');

  if (!process.env.APIFY_API_TOKEN) {
    console.log(`${FAIL} Skipped — APIFY_API_TOKEN not set`);
    allPassed = false;
  } else {
    process.stdout.write('  Connecting…');
    const result = await apifyTest();
    if (result.ok) {
      console.log(`\r${PASS} ${result.message}`);
    } else {
      console.log(`\r${FAIL} ${result.message}`);
      allPassed = false;
    }
  }

  console.log('');

  // ── 3. Google Sheets connection ────────────────────────────────────────────

  console.log('[ 3 ] Google Sheets');

  const hasCredentials =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!hasCredentials || !process.env.GOOGLE_SPREADSHEET_ID) {
    console.log(`${FAIL} Skipped — missing credentials or GOOGLE_SPREADSHEET_ID`);
    allPassed = false;
  } else {
    process.stdout.write('  Connecting…');
    const result = await sheetsTest();
    if (result.ok) {
      console.log(`\r${PASS} ${result.message}`);
    } else {
      console.log(`\r${FAIL} ${result.message}`);
      allPassed = false;
    }
  }

  console.log('');

  // ── 4. Config summary ──────────────────────────────────────────────────────

  console.log('[ 4 ] Workflow Configuration');
  console.log(`${PASS} Cities targeted     : ${config.cities.length} (${config.cities.join(', ')})`);
  console.log(`${PASS} Search term         : "${config.primarySearchTerm}"`);
  console.log(`${PASS} Max places/city     : ${config.maxPlacesPerCity}`);
  console.log(`${PASS} Max leads/run       : ${config.maxLeadsPerRun}`);
  console.log(`${PASS} Spreadsheet tab     : "${config.sheetName}"`);
  console.log(`${PASS} Spreadsheet ID      : ${config.spreadsheetId}`);
  console.log(`${PASS} Schedule            : ${process.env.CRON_SCHEDULE || '0 7 * * *'} (America/New_York)`);

  console.log('');

  // ── Result ─────────────────────────────────────────────────────────────────

  if (allPassed) {
    console.log('════════════════════════════════════════════════════════════════');
    console.log('  ALL CHECKS PASSED — You are ready to go!');
    console.log('');
    console.log('  Next steps:');
    console.log('    npm run run-once   ← Run one batch right now (writes to your sheet)');
    console.log('    npm start          ← Start the daily 7 AM Eastern scheduler');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('');
  } else {
    console.log('════════════════════════════════════════════════════════════════');
    console.log('  SETUP INCOMPLETE — Fix the issues marked with ✗ above,');
    console.log('  then re-run: npm run setup-check');
    console.log('');
    printHelp();
    console.log('════════════════════════════════════════════════════════════════');
    console.log('');
    process.exit(1);
  }
}

function printHelp() {
  console.log('  ── How to get your credentials ──────────────────────────────');
  console.log('');
  console.log('  APIFY_API_TOKEN');
  console.log('    1. Log in at apify.com');
  console.log('    2. Go to Settings → Integrations');
  console.log('    3. Copy your Personal API token');
  console.log('    Free tier gives $5/month compute credit — more than enough.');
  console.log('');
  console.log('  GOOGLE_SERVICE_ACCOUNT_KEY_FILE (for Google Sheets access)');
  console.log('    1. Go to console.cloud.google.com');
  console.log('    2. Enable the Google Sheets API for your project');
  console.log('    3. IAM → Service Accounts → Create → download JSON key');
  console.log('    4. Save as: hvac-lead-gen/credentials/service-account.json');
  console.log('    5. Open your Google Sheet → Share → paste the service account');
  console.log('       email (ends in @...iam.gserviceaccount.com) → Editor access');
  console.log('');
  console.log('  GOOGLE_SPREADSHEET_ID');
  console.log('    From your sheet URL:');
  console.log('    https://docs.google.com/spreadsheets/d/YOUR_ID_HERE/edit');
  console.log('');
}

main().catch((err) => {
  console.error('\n[Setup Check] Unexpected error:', err.message);
  process.exit(1);
});
