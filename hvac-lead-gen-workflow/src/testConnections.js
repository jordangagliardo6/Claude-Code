// Run this before your first scheduled run to confirm both Apollo and Google Sheets
// are reachable: npm run test-connections
require('dotenv').config();
const axios = require('axios');
const { getSheetsClient } = require('./sheetsClient');

async function testApollo() {
  try {
    if (!process.env.APOLLO_API_KEY) throw new Error('APOLLO_API_KEY is not set in .env');
    await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      { per_page: 1 },
      { headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.APOLLO_API_KEY } }
    );
    console.log('Apollo API key is valid and reachable.');
    return true;
  } catch (err) {
    console.error('Apollo API connection failed:', (err.response && err.response.data) || err.message);
    return false;
  }
}

async function testGoogleSheets() {
  try {
    const spreadsheetId = process.env.SPREADSHEET_ID;
    if (!spreadsheetId) throw new Error('SPREADSHEET_ID is not set in .env');
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    console.log(`Connected to Google Sheet: "${res.data.properties.title}"`);
    return true;
  } catch (err) {
    console.error('Google Sheets connection failed:', (err.response && err.response.data) || err.message);
    return false;
  }
}

(async () => {
  console.log('Testing Apollo and Google Sheets connections...\n');
  const apolloOk = await testApollo();
  const sheetsOk = await testGoogleSheets();

  console.log('\n--- Summary ---');
  console.log(`Apollo:        ${apolloOk ? 'OK' : 'FAILED'}`);
  console.log(`Google Sheets: ${sheetsOk ? 'OK' : 'FAILED'}`);

  if (!apolloOk || !sheetsOk) {
    process.exit(1);
  }
  console.log('\nBoth connections look good. You can now run "npm run run-once" or "npm start".');
})();
