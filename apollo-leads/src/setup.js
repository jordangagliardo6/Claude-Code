/**
 * First-run connection test — verifies Apollo API key and Google Sheets access
 * before the first scheduled run executes.
 *
 * Run with:  node src/setup.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const axios   = require('axios');
const { authorize } = require('./sheets');
const { google }    = require('googleapis');
const config  = require('./config');

async function testApollo() {
  console.log('\n[1/2] Testing Apollo.io API key...');

  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set in your .env file');
  }

  // Lightweight org search to validate the key without consuming lead credits
  const res = await axios.post(
    'https://api.apollo.io/v1/organizations/search',
    { q_organization_name: 'test', per_page: 1 },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.APOLLO_API_KEY,
      },
      timeout: 15_000,
    },
  );

  if (res.status === 200) {
    console.log('    ✓ Apollo API key is valid');
  }
}

async function testGoogleSheets() {
  console.log('\n[2/2] Testing Google Sheets connection...');

  if (!process.env.GOOGLE_SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID is not set in your .env file');
  }

  const auth   = await authorize();      // prompts for OAuth if no token.json yet
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    fields: 'properties.title',
  });

  const title = meta.data.properties?.title ?? '(unknown)';
  console.log(`    ✓ Connected to spreadsheet: "${title}"`);
  console.log(`    ✓ Sheet tab target: "${config.sheetName}"`);
}

async function main() {
  console.log('════ Apollo HVAC Lead Gen — Setup Check ════');

  try {
    await testApollo();
    await testGoogleSheets();

    console.log('\n════════════════════════════════════════════');
    console.log('  All connections verified — you are ready!');
    console.log('  Run the workflow now:  npm run run-now');
    console.log('  Start the scheduler:   npm start');
    console.log('════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n✗ Setup failed:', err.message);
    if (err.response?.data) {
      console.error('  API response:', JSON.stringify(err.response.data, null, 2));
    }
    console.error('\nCheck your .env values and credentials.json and try again.');
    process.exit(1);
  }
}

main();
