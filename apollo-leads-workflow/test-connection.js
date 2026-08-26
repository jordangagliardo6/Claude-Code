/**
 * Connection verification script — run this BEFORE the first scheduled run.
 *
 * Usage:
 *   node test-connection.js
 *
 * It will:
 *   1. Hit the Apollo API and confirm your key is valid + plan allows People Search
 *   2. Connect to Google Sheets and confirm the spreadsheet is accessible
 *   3. Print a summary so you know both integrations are green
 */

require('dotenv').config();
const axios = require('axios');
const { getSheetsClient, verifyConnection, readExistingBusinessNames } = require('./src/sheets');

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const SHEET_ID       = process.env.GOOGLE_SHEET_ID;
const KEY_FILE       = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ?? './google-credentials.json';

async function testApollo() {
  console.log('\n── Apollo.io ──────────────────────────────────');

  if (!APOLLO_API_KEY) {
    console.error('  ✗ APOLLO_API_KEY is not set in .env');
    return false;
  }

  try {
    // Use the user profile endpoint — available on all plans, no credits consumed
    const res = await axios.get('https://api.apollo.io/api/v1/users/api_profile', {
      headers: { 'x-api-key': APOLLO_API_KEY },
      timeout: 15_000,
    });

    const user = res.data?.user ?? res.data;
    const email = user?.email ?? user?.username ?? 'unknown';
    const plan  = user?.plan_type ?? user?.subscription?.plan_name ?? 'unknown';

    console.log(`  ✓ Connected — account: ${email}`);
    console.log(`  ✓ Plan: ${plan}`);

    if (plan && plan.toLowerCase().includes('free')) {
      console.warn('  ⚠  WARNING: Free plan detected.');
      console.warn('     The People Search API (mixed_people/api_search) requires a Basic');
      console.warn('     plan or higher. Upgrade at https://www.apollo.io/pricing');
      return false;
    }

    // Quick smoke-test of the People Search endpoint
    const searchRes = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/api_search',
      {
        api_key: APOLLO_API_KEY,
        per_page: 1,
        page: 1,
        organization_sic_codes: ['1711'],
        person_locations: ['Kalamazoo, Michigan'],
        person_titles: ['Owner'],
        organization_num_employees_ranges: ['1,10'],
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 20_000 }
    );

    const count = searchRes.data?.pagination?.total_entries ?? '?';
    console.log(`  ✓ People Search API accessible — test query returned ${count} total results`);
    return true;

  } catch (err) {
    if (err.response?.status === 422 || err.response?.data?.error_code === 'API_INACCESSIBLE') {
      console.error('  ✗ People Search API not accessible on your current Apollo plan.');
      console.error('    Upgrade to Basic ($49/mo) at https://www.apollo.io/pricing');
    } else if (err.response?.status === 401) {
      console.error('  ✗ Invalid API key — check APOLLO_API_KEY in your .env file');
    } else {
      console.error(`  ✗ Apollo error: ${err.message}`);
    }
    return false;
  }
}

async function testSheets() {
  console.log('\n── Google Sheets ──────────────────────────────');

  if (!SHEET_ID) {
    console.error('  ✗ GOOGLE_SHEET_ID is not set in .env');
    return false;
  }

  try {
    const sheets = await getSheetsClient(KEY_FILE);
    const title = await verifyConnection(sheets, SHEET_ID);
    console.log(`  ✓ Connected — spreadsheet: "${title}"`);

    const existingNames = await readExistingBusinessNames(sheets, SHEET_ID);
    console.log(`  ✓ Read ${existingNames.size} existing business name(s) from sheet`);
    console.log(`  ✓ Spreadsheet URL: https://docs.google.com/spreadsheets/d/${SHEET_ID}`);
    return true;

  } catch (err) {
    if (err.message?.includes('ENOENT') || err.message?.includes('no such file')) {
      console.error(`  ✗ Service account key file not found at: ${KEY_FILE}`);
      console.error('    See the setup guide in README for how to create it.');
    } else if (err.code === 403) {
      console.error('  ✗ Permission denied — share the spreadsheet with your service account email');
      console.error('    (find the email in your google-credentials.json under "client_email")');
    } else {
      console.error(`  ✗ Sheets error: ${err.message}`);
    }
    return false;
  }
}

async function main() {
  console.log('SW Michigan HVAC Lead Gen — Connection Test');
  console.log('='.repeat(46));

  const apolloOk = await testApollo();
  const sheetsOk = await testSheets();

  console.log('\n── Summary ────────────────────────────────────');
  console.log(`  Apollo.io:     ${apolloOk ? '✓ READY' : '✗ NEEDS ATTENTION'}`);
  console.log(`  Google Sheets: ${sheetsOk ? '✓ READY' : '✗ NEEDS ATTENTION'}`);

  if (apolloOk && sheetsOk) {
    console.log('\n  Both connections verified. Run "node index.js" to start the scheduler,');
    console.log('  or "node index.js --run-now" to pull leads immediately.\n');
  } else {
    console.log('\n  Fix the issues above before running the scheduler.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
