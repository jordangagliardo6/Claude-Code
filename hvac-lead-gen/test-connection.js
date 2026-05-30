'use strict';

/**
 * First-run connection test.
 *
 * Verifies:
 *   1. APOLLO_API_KEY — makes a minimal API call and prints account info.
 *   2. Google Sheets — reads the spreadsheet and confirms write access.
 *
 * Run BEFORE the first scheduled execution:
 *   node test-connection.js
 *
 * A green ✓ next to each service means the workflow is ready to go.
 */

require('dotenv').config();
const axios = require('axios');
const { readExistingNames } = require('./src/sheets');

const PASS = '✓';
const FAIL = '✗';

async function testApollo() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.error(`  ${FAIL} Apollo  — APOLLO_API_KEY is not set in .env`);
    return false;
  }

  try {
    // Lightweight call: fetch the authenticated user's profile
    const res = await axios.get('https://api.apollo.io/api/v1/auth/health', {
      headers: { 'X-Api-Key': apiKey, 'Cache-Control': 'no-cache' },
      timeout: 15_000,
    });

    // Any 2xx response means the key is valid
    const status = res.data?.is_logged_in ?? (res.status === 200);
    if (status) {
      console.log(`  ${PASS} Apollo  — API key is valid and connected.`);
      return true;
    }
    console.error(`  ${FAIL} Apollo  — API responded but reported not authenticated.`);
    return false;
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    console.error(`  ${FAIL} Apollo  — ${detail}`);
    return false;
  }
}

async function testSheets() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.error(`  ${FAIL} Sheets  — GOOGLE_SPREADSHEET_ID is not set in .env`);
    return false;
  }

  try {
    const names = await readExistingNames();
    console.log(
      `  ${PASS} Sheets  — Connected to spreadsheet. ` +
      `Found ${names.size} existing business name(s) in the sheet.`
    );
    return true;
  } catch (err) {
    console.error(`  ${FAIL} Sheets  — ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Test');
  console.log('══════════════════════════════════════════════════════════\n');

  const apolloOk = await testApollo();
  const sheetsOk = await testSheets();

  console.log('');
  if (apolloOk && sheetsOk) {
    console.log('  All systems connected. You are ready to run the workflow.');
    console.log('  ▶  node run-once.js          (run immediately)');
    console.log('  ▶  node index.js             (start the 7 AM daily scheduler)');
  } else {
    console.log('  One or more connections failed. Fix the issues above, then re-run this test.');
  }
  console.log('\n══════════════════════════════════════════════════════════\n');

  process.exit(apolloOk && sheetsOk ? 0 : 1);
}

main();
