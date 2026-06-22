// Run with `npm run test-connection` before your first scheduled run.
// Verifies Apollo and Google Sheets are both reachable without writing any
// data or revealing any phone numbers (so it doesn't burn Apollo credits).
require('dotenv').config();
const axios = require('axios');
const config = require('./config');
const sheets = require('./sheetsClient');

async function testApollo() {
  if (!config.apollo.apiKey) {
    console.log('Apollo:   FAILED -- APOLLO_API_KEY is not set in .env');
    return false;
  }

  try {
    await axios.post(
      `${config.apollo.baseUrl}/mixed_people/search`,
      { per_page: 1, page: 1, person_locations: ['Michigan, US'] },
      { headers: { 'X-Api-Key': config.apollo.apiKey, 'Content-Type': 'application/json' } }
    );
    console.log('Apollo:   OK -- API key is valid and the search endpoint responded.');
    return true;
  } catch (err) {
    const detail = err.response ? `HTTP ${err.response.status}` : err.message;
    console.log(`Apollo:   FAILED -- ${detail}`);
    return false;
  }
}

async function testGoogleSheets() {
  if (!config.googleSheets.spreadsheetId) {
    console.log('Google:   FAILED -- GOOGLE_SHEET_ID is not set in .env');
    return false;
  }

  try {
    await sheets.ensureHeaderRow();
    console.log('Google:   OK -- connected and able to read/write the spreadsheet.');
    return true;
  } catch (err) {
    console.log(`Google:   FAILED -- ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('Testing connections...\n');
  const [apolloOk, googleOk] = await Promise.all([testApollo(), testGoogleSheets()]);
  console.log('');

  if (apolloOk && googleOk) {
    console.log('Both connections succeeded. You are ready to run "npm run run:once" or start the scheduler.');
    process.exit(0);
  } else {
    console.log('Fix the FAILED item(s) above before running the workflow.');
    process.exit(1);
  }
}

main();
