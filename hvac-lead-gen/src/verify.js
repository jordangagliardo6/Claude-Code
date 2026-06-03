'use strict';

/**
 * Pre-flight connection check.
 * Run this ONCE before your first scheduled run to confirm both APIs work.
 *
 * Usage: npm run verify
 *
 * What it checks:
 *   1. APOLLO_API_KEY — makes a minimal search call and reports quota
 *   2. Google Sheets — authenticates and opens your spreadsheet by ID
 *   3. Prints a pass/fail summary with fix instructions on failure
 */

require('dotenv').config();
const axios = require('axios');
const { testConnection } = require('./sheets');

const BOLD  = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const CYAN  = '\x1b[36m';
const RESET = '\x1b[0m';

function ok(label)   { console.log(`  ${GREEN}✔${RESET}  ${label}`); }
function fail(label) { console.log(`  ${RED}✘${RESET}  ${label}`); }
function info(msg)   { console.log(`     ${CYAN}${msg}${RESET}`); }

async function checkApollo() {
  console.log(`\n${BOLD}1. Apollo.io${RESET}`);

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    fail('APOLLO_API_KEY not set');
    info('Copy .env.example → .env and fill in your Apollo API key.');
    info('Get it at: https://app.apollo.io/#/settings/integrations/api');
    return false;
  }
  ok('APOLLO_API_KEY found in environment');

  try {
    const response = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      {
        api_key: apiKey,
        person_titles: ['Owner'],
        organization_locations: ['Michigan, United States'],
        q_organization_keyword_tags: ['hvac'],
        organization_num_employees_ranges: ['1,10'],
        per_page: 1,
        page: 1,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
    );

    const total = response.data?.pagination?.total_entries ?? '?';
    ok(`Apollo API responded successfully`);
    info(`Matching contacts in Apollo database: ~${total.toLocaleString()}`);
    return true;
  } catch (err) {
    const status = err.response?.status;
    const msg    = err.response?.data?.message || err.message;
    fail(`Apollo API call failed (HTTP ${status}): ${msg}`);

    if (status === 401) info('Your API key is invalid or expired. Generate a new one in Apollo settings.');
    if (status === 429) info('Rate limit hit. Wait a minute and try again.');
    return false;
  }
}

async function checkSheets() {
  console.log(`\n${BOLD}2. Google Sheets${RESET}`);

  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetName = process.env.SHEET_NAME || 'Sheet1';
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-service-account.json';

  if (!spreadsheetId || spreadsheetId === 'your_spreadsheet_id_here') {
    fail('SPREADSHEET_ID not set');
    info('Set SPREADSHEET_ID in your .env file.');
    info('Find it in your Google Sheet URL: /spreadsheets/d/SPREADSHEET_ID/edit');
    return false;
  }
  ok('SPREADSHEET_ID found in environment');

  try {
    const title = await testConnection(spreadsheetId, sheetName);
    ok(`Connected to spreadsheet: "${title}"`);
    ok(`Sheet tab "${sheetName}" exists`);
    return true;
  } catch (err) {
    fail(`Google Sheets connection failed: ${err.message}`);

    if (err.message.includes('not found')) {
      info(`Credentials file missing at: ${credPath}`);
      info('Follow the Google setup guide below to create a service account.');
    } else if (err.message.toLowerCase().includes('permission')) {
      info('Share your Google Sheet with the service account email (Editor role).');
      info('The email is in your credentials JSON under "client_email".');
    } else if (err.message.includes('tab')) {
      info(`Create a sheet tab named exactly "${sheetName}" in your spreadsheet.`);
    }
    return false;
  }
}

async function main() {
  console.log(`\n${BOLD}═══════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  HVAC Lead Gen — Pre-Flight Check${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════${RESET}`);

  const apolloOk = await checkApollo();
  const sheetsOk = await checkSheets();

  console.log(`\n${BOLD}Summary${RESET}`);
  console.log(`  Apollo.io     ${apolloOk ? GREEN + '✔ PASS' : RED + '✘ FAIL'}${RESET}`);
  console.log(`  Google Sheets ${sheetsOk ? GREEN + '✔ PASS' : RED + '✘ FAIL'}${RESET}`);

  if (apolloOk && sheetsOk) {
    console.log(`\n${GREEN}${BOLD}All systems go!${RESET}`);
    console.log('  Run a manual test now:   npm run run-now');
    console.log('  Start the daily cron:    npm start\n');
  } else {
    console.log(`\n${RED}Fix the issues above and run \`npm run verify\` again.${RESET}`);
    console.log('\n─── Google Setup Reminder ─────────────────────────────');
    console.log(' 1. Go to https://console.cloud.google.com');
    console.log(' 2. Create or select a project');
    console.log(' 3. Enable "Google Sheets API"');
    console.log(' 4. IAM & Admin → Service Accounts → Create Service Account');
    console.log(' 5. Keys → Add Key → JSON → download the file');
    console.log(' 6. Save it to: credentials/google-service-account.json');
    console.log(' 7. Open your Google Sheet → Share → paste the service account');
    console.log('    client_email from the JSON and give it Editor access\n');
    process.exit(1);
  }
}

main();
