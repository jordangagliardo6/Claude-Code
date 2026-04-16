// ─────────────────────────────────────────────────────────────────────────────
// setup-check.js — First-run connection verifier
// Run this BEFORE starting the scheduler to confirm everything is wired up:
//   npm run setup-check
//
// Checks:
//   ✓ .env file is loaded and required vars are present
//   ✓ Apollo.io API key is valid and can perform searches
//   ✓ Google service account credentials are readable
//   ✓ Google Sheets spreadsheet is accessible
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const { testConnection: apolloTest  } = require('./apollo');
const { testConnection: sheetsTest  } = require('./sheets');
const config                          = require('./config');

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
    { key: 'APOLLO_API_KEY',                   label: 'APOLLO_API_KEY'                   },
    { key: 'GOOGLE_SPREADSHEET_ID',            label: 'GOOGLE_SPREADSHEET_ID'            },
    {
      key  : '_GOOGLE_CREDS',
      label: 'Google credentials (KEY_FILE or JSON)',
      value: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    },
  ];

  for (const c of checks) {
    const val = c.value !== undefined ? c.value : process.env[c.key];
    if (val) {
      const preview = val.length > 40 ? val.slice(0, 40) + '…' : val;
      console.log(`${PASS} ${c.label}: ${preview}`);
    } else {
      console.log(`${FAIL} ${c.label} is NOT set`);
      allPassed = false;
    }
  }

  // Optional: notification email
  if (config.notificationEmail) {
    console.log(`${PASS} NOTIFICATION_EMAIL: ${config.notificationEmail}`);
  } else {
    console.log(`${WARN} NOTIFICATION_EMAIL not set (error alerts will only go to console)`);
  }

  console.log('');

  // ── 2. Apollo.io connection ────────────────────────────────────────────────

  console.log('[ 2 ] Apollo.io API');

  if (!process.env.APOLLO_API_KEY) {
    console.log(`${FAIL} Skipped — APOLLO_API_KEY not set`);
    allPassed = false;
  } else {
    process.stdout.write('  Connecting…');
    const result = await apolloTest();
    if (result.ok) {
      console.log(`\r${PASS} ${result.message}`);
    } else {
      console.log(`\r${FAIL} ${result.message}`);
      allPassed = false;
    }
  }

  console.log('');

  // ── 3. Google Sheets connection ────────────────────────────────────────────

  console.log('[ 3 ] Google Sheets API');

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
  console.log(`${PASS} Cities to search    : ${config.cities.length} (${config.cities.map((c) => c.split(',')[0]).join(', ')})`);
  console.log(`${PASS} Industries          : ${config.industries.join(', ')}`);
  console.log(`${PASS} Job titles          : ${config.jobTitles.join(', ')}`);
  console.log(`${PASS} Employee range      : ${config.employeeRange}`);
  console.log(`${PASS} Max leads per run   : ${config.maxLeadsPerRun}`);
  console.log(`${PASS} Spreadsheet tab     : "${config.sheetName}"`);
  console.log(`${PASS} Schedule            : ${process.env.CRON_SCHEDULE || '0 7 * * *'} (America/New_York)`);

  console.log('');

  // ── Result ─────────────────────────────────────────────────────────────────

  if (allPassed) {
    console.log('════════════════════════════════════════════════════════════════');
    console.log('  ALL CHECKS PASSED — You are ready to go!');
    console.log('');
    console.log('  Next steps:');
    console.log('    npm run run-once   ← Run one batch right now (test mode)');
    console.log('    npm start          ← Start the daily 7 AM scheduler');
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
  console.log('  ── How to get your API keys ──────────────────────────────');
  console.log('');
  console.log('  APOLLO_API_KEY');
  console.log('    1. Log in to Apollo.io');
  console.log('    2. Go to Settings → Integrations → API');
  console.log('    3. Copy your API key');
  console.log('');
  console.log('  GOOGLE_SERVICE_ACCOUNT_KEY_FILE (Google Sheets access)');
  console.log('    1. Go to console.cloud.google.com');
  console.log('    2. Create a project (or use existing)');
  console.log('    3. Enable the Google Sheets API');
  console.log('    4. Go to IAM → Service Accounts → Create Service Account');
  console.log('    5. Create a JSON key and download it');
  console.log('    6. Save the file as credentials/service-account.json');
  console.log('    7. IMPORTANT: Open your Google Sheet → Share → paste the');
  console.log('       service account email (ends in @...iam.gserviceaccount.com)');
  console.log('       Give it "Editor" access');
  console.log('');
  console.log('  GOOGLE_SPREADSHEET_ID');
  console.log('    From the spreadsheet URL:');
  console.log('    https://docs.google.com/spreadsheets/d/YOUR_ID_HERE/edit');
  console.log('');
}

main().catch((err) => {
  console.error('\n[Setup Check] Unexpected error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
