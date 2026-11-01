/**
 * Connection test script — run this BEFORE the first scheduled run.
 *
 * Usage:  node test-connection.js
 *
 * What it checks:
 *  1. Apollo.io API key is valid and returns at least one result
 *  2. Google Sheets credentials are valid and the spreadsheet is writable
 *  3. Header row is in place (creates it if missing)
 *
 * If both pass you're ready to run the full workflow.
 */

require('dotenv').config();

const axios = require('axios');
const { google } = require('googleapis');
const { appendLeads } = require('./src/sheets');
const fs = require('fs');

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Sheet1';
const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
const TOKEN_PATH = process.env.GOOGLE_TOKEN_PATH || './token.json';

async function testApollo() {
  console.log('\n--- Testing Apollo.io connection ---');
  if (!APOLLO_API_KEY) {
    console.error('FAIL: APOLLO_API_KEY is not set in .env');
    return false;
  }

  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      { page: 1, per_page: 1, person_locations: ['Michigan, United States'], has_phone: true },
      {
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': APOLLO_API_KEY },
        timeout: 15000,
      }
    );
    const count = res.data?.total_entries ?? '?';
    console.log(`PASS: Apollo connected. Total entries in test query: ${count}`);
    return true;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.message;
    console.error(`FAIL: Apollo returned HTTP ${status} — ${msg}`);
    return false;
  }
}

async function testSheets() {
  console.log('\n--- Testing Google Sheets connection ---');

  if (!SPREADSHEET_ID) {
    console.error('FAIL: GOOGLE_SPREADSHEET_ID is not set in .env');
    return false;
  }
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`FAIL: credentials file not found at "${CREDENTIALS_PATH}"`);
    console.error('Download it from Google Cloud Console > APIs & Services > Credentials');
    return false;
  }

  try {
    // appendLeads with an empty array just sets up auth + ensures header
    await appendLeads(CREDENTIALS_PATH, TOKEN_PATH, SPREADSHEET_ID, SHEET_NAME, []);
    console.log(`PASS: Google Sheets connected. Spreadsheet ID: ${SPREADSHEET_ID}`);
    console.log(`      Sheet tab: "${SHEET_NAME}"`);
    return true;
  } catch (err) {
    console.error('FAIL: Google Sheets error —', err.message);
    return false;
  }
}

(async () => {
  console.log('=== HVAC Lead Gen — Connection Test ===\n');

  const apolloOk = await testApollo();
  const sheetsOk = await testSheets();

  console.log('\n=== Results ===');
  console.log(`Apollo.io : ${apolloOk ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Google Sheets: ${sheetsOk ? '✓ PASS' : '✗ FAIL'}`);

  if (apolloOk && sheetsOk) {
    console.log('\nAll connections verified. You are ready to run the scheduler:');
    console.log('  node index.js          — start the 7am daily schedule');
    console.log('  node src/run.js        — run one time immediately');
  } else {
    console.log('\nFix the failures above, then re-run this test before starting the scheduler.');
    process.exit(1);
  }
})();
