'use strict';

/**
 * First-Run Setup & Connection Tester
 *
 * Run this BEFORE starting the scheduler to confirm both APIs are reachable:
 *   node setup.js
 *
 * What it checks:
 *   1. Required environment variables are present
 *   2. Apollo.io API key is valid (test search with 1 result)
 *   3. Google Sheets connection works and the spreadsheet is accessible
 *   4. The target sheet tab exists (creates headers if sheet is empty)
 */

require('dotenv').config();
const axios = require('axios');
const { testConnection } = require('./src/driveService');

const OK = '✓';
const FAIL = '✗';

function pass(msg) { console.log(`  ${OK}  ${msg}`); }
function fail(msg) { console.error(`  ${FAIL}  ${msg}`); }
function section(title) {
  console.log('');
  console.log(`── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`);
}

async function checkEnvVars() {
  section('Environment Variables');

  const required = [
    ['APOLLO_API_KEY', 'Apollo.io API key'],
    ['GOOGLE_SPREADSHEET_ID', 'Target Google Spreadsheet ID'],
  ];

  const credSet = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ||
                  process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  let allPresent = true;

  for (const [key, label] of required) {
    if (process.env[key]) {
      pass(`${key} is set  (${label})`);
    } else {
      fail(`${key} is MISSING  (${label})`);
      allPresent = false;
    }
  }

  if (credSet) {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
      pass('GOOGLE_SERVICE_ACCOUNT_KEY_PATH is set');
    } else {
      pass('GOOGLE_SERVICE_ACCOUNT_JSON is set (inline credentials)');
    }
  } else {
    fail('No Google credentials found. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_SERVICE_ACCOUNT_JSON');
    allPresent = false;
  }

  const optional = [
    ['GOOGLE_SHEET_NAME', 'Sheet tab name (defaults to "Sheet1")'],
    ['MAX_LEADS_PER_RUN', 'Max leads per run (defaults to 25)'],
    ['ALERT_EMAIL', 'Email address for error alerts (optional)'],
  ];

  for (const [key, label] of optional) {
    const val = process.env[key];
    if (val) {
      pass(`${key} = "${val}"  (${label})`);
    } else {
      console.log(`  -  ${key} not set — ${label}`);
    }
  }

  return allPresent;
}

async function checkApollo() {
  section('Apollo.io API');

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    fail('Skipped — APOLLO_API_KEY not set');
    return false;
  }

  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: apiKey,
        q_organization_keyword_tags: ['HVAC'],
        person_titles: ['Owner'],
        person_locations: ['Kalamazoo, Michigan, United States'],
        organization_num_employees_ranges: ['1,10'],
        per_page: 1,
        page: 1,
      },
      {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        timeout: 20_000,
      }
    );

    const people = res.data.people || res.data.contacts || [];
    const total = (res.data.pagination || {}).total_entries || 0;

    pass(`Apollo API key is valid`);
    pass(`Test search returned ${total} total matching records`);

    if (total === 0) {
      console.log(
        '  ⚠  Zero results on test query — this could mean no HVAC owners are\n' +
        '     indexed in Kalamazoo yet, or your Apollo plan excludes this region.\n' +
        '     The full workflow searches all 7 cities so real runs may find more.'
      );
    } else {
      const sample = people[0];
      const org = (sample && sample.organization) || {};
      console.log(`  ℹ  Sample result: "${sample.first_name} ${sample.last_name}" — ${org.name || '(no org)'} — ${sample.city || ''}`);
    }

    return true;
  } catch (err) {
    const status = err.response && err.response.status;
    const body = err.response && err.response.data;

    if (status === 401) {
      fail('Apollo API key is invalid (HTTP 401)');
    } else if (status === 422) {
      fail('Apollo rejected search params (HTTP 422) — check INDUSTRY_KEYWORDS / cities in apolloService.js');
      console.log('  Detail:', JSON.stringify(body));
    } else {
      fail(`Apollo request failed: ${err.message}`);
    }
    return false;
  }
}

async function checkGoogleSheets() {
  section('Google Sheets');

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    fail('Skipped — GOOGLE_SPREADSHEET_ID not set');
    return false;
  }

  try {
    const info = await testConnection();
    const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

    pass(`Connected to spreadsheet: "${info.title}"`);
    pass(`Tabs found: ${info.tabs.join(', ')}`);

    if (info.tabs.includes(sheetName)) {
      pass(`Target tab "${sheetName}" exists`);
    } else {
      fail(
        `Tab "${sheetName}" not found in this spreadsheet.\n` +
        `     Available tabs: ${info.tabs.join(', ')}\n` +
        `     Update GOOGLE_SHEET_NAME in .env to match one of the above.`
      );
      return false;
    }

    return true;
  } catch (err) {
    if (err.code === 403 || (err.message && err.message.includes('403'))) {
      fail('Permission denied (HTTP 403).');
      console.log(
        '  Make sure you have shared the spreadsheet with the service account email.\n' +
        '  The email is in your google-service-account.json under "client_email".'
      );
    } else if (err.code === 404 || (err.message && err.message.includes('404'))) {
      fail('Spreadsheet not found (HTTP 404) — check GOOGLE_SPREADSHEET_ID in .env');
    } else {
      fail(`Google Sheets error: ${err.message}`);
    }
    return false;
  }
}

async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log('   HVAC Lead Gen — First-Run Setup Check');
  console.log('══════════════════════════════════════════════════════');

  const envOk = await checkEnvVars();
  const apolloOk = await checkApollo();
  const sheetsOk = await checkGoogleSheets();

  section('Summary');

  const allGood = envOk && apolloOk && sheetsOk;

  if (allGood) {
    console.log('');
    console.log(`  ${OK}  All checks passed — you are ready to go!`);
    console.log('');
    console.log('  Next steps:');
    console.log('  1. Run once manually to confirm end-to-end:');
    console.log('       node index.js --now');
    console.log('');
    console.log('  2. Start the scheduler (runs every day at 7 AM ET):');
    console.log('       node index.js');
    console.log('');
    console.log('  3. To keep the scheduler alive permanently:');
    console.log('       npm install -g pm2');
    console.log('       pm2 start index.js --name hvac-leads');
    console.log('       pm2 save && pm2 startup');
    console.log('');
  } else {
    console.log('');
    console.log(`  ${FAIL}  Some checks failed. Fix the issues above, then re-run: node setup.js`);
    console.log('');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nSetup script crashed:', err.message);
  process.exit(1);
});
