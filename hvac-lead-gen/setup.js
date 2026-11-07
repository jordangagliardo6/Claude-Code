/**
 * First-run setup verification.
 *
 * Checks that both Apollo.io and Google Sheets connections are working
 * before the first scheduled run executes.
 *
 * Usage:
 *   node setup.js
 */

'use strict';

require('dotenv').config();

const axios = require('axios');
const { buildSheetsClient } = require('./src/sheets');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8';
const SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';
const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-service-account.json';

// ANSI colours for terminal output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function ok(msg) { console.log(`${GREEN}  ✓${RESET} ${msg}`); }
function fail(msg) { console.log(`${RED}  ✗${RESET} ${msg}`); }
function info(msg) { console.log(`${YELLOW}  →${RESET} ${msg}`); }

async function checkApollo() {
  console.log('\n── Apollo.io ─────────────────────────────────────');
  const apiKey = process.env.APOLLO_API_KEY;

  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    fail('APOLLO_API_KEY is not set in .env');
    info('Get your key at https://developer.apollo.io → API Keys');
    info('Free tier: 50 people enrichments/month');
    info('Basic plan ($49/mo): 1,000 enrichments/month — recommended for daily runs');
    return false;
  }

  try {
    // Lightweight check: search for 1 result to verify auth
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: apiKey,
        page: 1,
        per_page: 1,
        person_titles: ['Owner'],
        organization_locations: ['Michigan, United States'],
        organization_num_employees_ranges: ['1,25'],
      },
      {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 15_000,
      }
    );

    if (res.status === 200) {
      const count = (res.data.people || []).length;
      ok(`Apollo API key is valid (test query returned ${count} result)`);
      return true;
    }
    fail(`Unexpected status ${res.status}`);
    return false;
  } catch (err) {
    if (err.response?.status === 401) {
      fail('Apollo API key is invalid or expired');
    } else if (err.response?.status === 422) {
      fail(`Apollo rejected the query: ${JSON.stringify(err.response.data)}`);
    } else {
      fail(`Apollo connection error: ${err.message}`);
    }
    return false;
  }
}

async function checkSheets() {
  console.log('\n── Google Sheets ─────────────────────────────────');

  if (!process.env.GOOGLE_CREDENTIALS_PATH && !require('fs').existsSync('./credentials/google-service-account.json')) {
    fail('Google service-account JSON not found.');
    printGoogleSetupGuide();
    return false;
  }

  try {
    const sheets = buildSheetsClient(CREDENTIALS_PATH);
    const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    ok(`Connected to spreadsheet: "${res.data.properties.title}"`);
    ok(`Spreadsheet ID: ${SPREADSHEET_ID}`);

    // Check if the target sheet tab exists
    const tabNames = res.data.sheets.map((s) => s.properties.title);
    if (tabNames.includes(SHEET_NAME)) {
      ok(`Sheet tab "${SHEET_NAME}" found`);
    } else {
      fail(`Sheet tab "${SHEET_NAME}" not found. Available tabs: ${tabNames.join(', ')}`);
      info(`Set SHEET_NAME in .env to one of: ${tabNames.join(', ')}`);
      return false;
    }
    return true;
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('credentials')) {
      fail(err.message);
      printGoogleSetupGuide();
    } else if (err.code === 403) {
      fail('Permission denied — the service account does not have access to this spreadsheet.');
      info(`Open the spreadsheet and share it (Editor) with your service account email.`);
      info('The service account email is in your google-service-account.json under "client_email".');
    } else if (err.code === 404) {
      fail(`Spreadsheet not found (ID: ${SPREADSHEET_ID}). Check SPREADSHEET_ID in .env.`);
    } else {
      fail(`Google Sheets error: ${err.message}`);
    }
    return false;
  }
}

function printGoogleSetupGuide() {
  console.log(`
${YELLOW}  How to create a Google Service Account (5 minutes):${RESET}

  1. Go to https://console.cloud.google.com/
  2. Create a new project (e.g. "hvac-lead-gen")
  3. Enable the Google Sheets API:
       APIs & Services → Enable APIs → search "Google Sheets API" → Enable
  4. Create a service account:
       APIs & Services → Credentials → Create Credentials → Service Account
       Name it anything (e.g. "lead-gen-bot"), click Done
  5. Click the service account → Keys tab → Add Key → JSON → download
  6. Save the downloaded file as:
       ${require('path').resolve('./credentials/google-service-account.json')}
  7. Set GOOGLE_CREDENTIALS_PATH in .env (or leave default if path matches above)
  8. Open your Google Sheet and share it (Editor access) with the service account email.
     The email is inside the JSON file under "client_email".
  9. Run "node setup.js" again to verify.
`);
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   HVAC Lead Gen — First-Run Connection Check     ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const apolloOk = await checkApollo();
  const sheetsOk = await checkSheets();

  console.log('\n── Summary ───────────────────────────────────────');
  if (apolloOk && sheetsOk) {
    console.log(`${GREEN}  All checks passed!${RESET}`);
    console.log('  Run "node index.js --run-now" to do a live test pull.');
    console.log('  Run "node index.js" to start the daily 7am scheduler.');
  } else {
    console.log(`${RED}  One or more checks failed.${RESET} Fix the issues above, then re-run "node setup.js".`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('Setup script error:', err);
  process.exit(1);
});
