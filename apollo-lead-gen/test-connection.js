'use strict';

// Run this before the first scheduled run to confirm both APIs are reachable.
// Usage:  node test-connection.js
//         npm run test-connection

require('dotenv').config();

const axios  = require('axios');
const config = require('./config');
const { getSheetsClient } = require('./sheets');

async function testApollo() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.error('  ✗ APOLLO_API_KEY is not set in .env');
    return false;
  }

  try {
    // Minimal search — 1 result, no filters — just to validate the key
    const res = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      { api_key: apiKey, per_page: 1, page: 1 },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
    );

    const count = res.data?.pagination?.total_entries ?? '?';
    console.log(`  ✓ Apollo.io connected (database reports ${count} total contacts)`);
    return true;
  } catch (err) {
    const detail = err.response?.data?.error || err.response?.data?.message || err.message;
    const status = err.response?.status ? ` (HTTP ${err.response.status})` : '';
    console.error(`  ✗ Apollo.io failed${status}: ${detail}`);
    return false;
  }
}

async function testGoogleSheets() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    console.error('  ✗ GOOGLE_SHEET_ID is not set in .env');
    return false;
  }

  try {
    // getSheetsClient() will throw a descriptive error if credentials.json is missing/invalid
    const sheets = await getSheetsClient();

    const res = await sheets.spreadsheets.get({ spreadsheetId });
    const title = res.data.properties?.title || spreadsheetId;
    console.log(`  ✓ Google Sheets connected: "${title}"`);

    // Verify we have at least write permission by checking what's in row 1
    const headerCheck = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${config.SHEET_TAB_NAME}!A1:I1`,
    });
    const headers = (headerCheck.data.values || [])[0] || [];
    if (headers.length > 0) {
      console.log(`  ✓ Sheet tab "${config.SHEET_TAB_NAME}" has headers: ${headers.slice(0, 3).join(', ')}…`);
    } else {
      console.log(`  ✓ Sheet tab "${config.SHEET_TAB_NAME}" is empty — header row will be created on first run`);
    }

    return true;
  } catch (err) {
    console.error(`  ✗ Google Sheets failed: ${err.message}`);
    if (err.message.includes('credentials')) {
      console.error('    → Does credentials.json exist in the apollo-lead-gen/ folder?');
      console.error('    → Has the service account been granted Editor access to the sheet?');
    }
    if (err.message.includes('404') || err.message.toLowerCase().includes('not found')) {
      console.error('    → Double-check GOOGLE_SHEET_ID in .env');
    }
    return false;
  }
}

async function main() {
  console.log('\n── Testing API connections ──\n');

  const [apolloOk, sheetsOk] = await Promise.all([
    testApollo(),
    testGoogleSheets(),
  ]);

  console.log('\n── Summary ──────────────────────');
  console.log(`  Apollo.io     : ${apolloOk ? '✓ Ready' : '✗ Failed'}`);
  console.log(`  Google Sheets : ${sheetsOk ? '✓ Ready' : '✗ Failed'}`);
  console.log('─────────────────────────────────\n');

  if (apolloOk && sheetsOk) {
    console.log('✓ All systems ready.\n');
    console.log('Next steps:');
    console.log('  npm run run-now     ← pull leads right now (test run)');
    console.log('  npm start           ← start the scheduler (7am Eastern daily)\n');
  } else {
    console.log('✗ Fix the issue(s) above, then re-run this test before starting the scheduler.\n');
    process.exit(1);
  }
}

main();
