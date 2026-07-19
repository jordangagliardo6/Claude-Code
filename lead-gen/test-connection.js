'use strict';

/**
 * Run this script BEFORE your first scheduled run to confirm both
 * Apollo.io and Google Sheets are connected and working.
 *
 * Usage:
 *   node test-connection.js
 */

require('dotenv').config();

const axios = require('axios');
const { testConnection: testSheets } = require('./sheets');

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✓  ${label}`);
  passed++;
}

function fail(label, err) {
  console.error(`  ✗  ${label}`);
  console.error(`     ${err.message}`);
  failed++;
}

async function checkApollo() {
  console.log('\n── Apollo.io ─────────────────────────────────────────────');

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || apiKey === 'your_apollo_api_key_here') {
    fail('APOLLO_API_KEY env var set', new Error('APOLLO_API_KEY is missing or still set to the placeholder value.'));
    return;
  }
  ok('APOLLO_API_KEY env var set');

  try {
    // Use the account profile endpoint as a cheap connectivity test
    const res = await axios.get('https://api.apollo.io/v1/users/me', {
      headers: { 'X-Api-Key': apiKey },
      timeout: 15000,
    });
    ok(`Apollo account connected  (user: ${res.data.user?.email || 'unknown'})`);
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      fail('Apollo credentials valid', new Error(`HTTP ${status} — check your APOLLO_API_KEY.`));
    } else {
      fail('Apollo API reachable', new Error(`HTTP ${status || 'timeout'} — ${err.message}`));
    }
  }
}

async function checkGoogleSheets() {
  console.log('\n── Google Sheets ─────────────────────────────────────────');

  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const spreadsheetId = process.env.SPREADSHEET_ID;

  if (!spreadsheetId || spreadsheetId === 'your_google_spreadsheet_id_here') {
    fail('SPREADSHEET_ID env var set', new Error('SPREADSHEET_ID is missing or still set to the placeholder value.'));
    return;
  }
  ok('SPREADSHEET_ID env var set');

  try {
    const fs = require('fs');
    const path = require('path');
    if (!fs.existsSync(path.resolve(credPath))) {
      throw new Error(`File not found: ${credPath}`);
    }
    ok(`credentials.json found at ${credPath}`);
  } catch (err) {
    fail('credentials.json found', err);
    return;
  }

  try {
    const title = await testSheets();
    ok(`Google Sheets connected  (spreadsheet: "${title}")`);
  } catch (err) {
    fail('Google Sheets API call succeeded', err);
    console.log('');
    console.log('     Possible causes:');
    console.log('       • credentials.json is invalid or expired');
    console.log('       • You have not shared the spreadsheet with the service account email');
    console.log('       • The Sheets API is not enabled in your Google Cloud project');
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  HVAC Lead-Gen — Connection Check');
  console.log('═══════════════════════════════════════════════════════════');

  await checkApollo();
  await checkGoogleSheets();

  console.log('\n─────────────────────────────────────────────────────────');
  console.log(`  Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('\n  Everything looks good! Start the scheduler with:');
    console.log('    node index.js\n');
    console.log('  Or run one batch right now with:');
    console.log('    node index.js --run-now\n');
  } else {
    console.log('\n  Fix the issues above, then re-run this script.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nUnexpected error during connection test:', err);
  process.exit(1);
});
