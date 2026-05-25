/**
 * Connection test — verifies both Apollo and Google Sheets are reachable
 * before the first scheduled run. Run this immediately after setup.
 *
 * Usage: node src/test-connections.js
 */

require('dotenv').config();
const axios = require('axios');
const { testConnection } = require('./googleDrive');
const config = require('./config');

async function testApollo() {
  if (!config.apollo.apiKey) {
    throw new Error('APOLLO_API_KEY is missing from .env');
  }

  console.log('[Test] Pinging Apollo.io API...');

  // Lightweight endpoint: fetch own account info
  const res = await axios.get(`${config.apollo.baseUrl}/auth/health`, {
    headers: { 'X-Api-Key': config.apollo.apiKey },
    validateStatus: () => true,
  });

  if (res.status === 200 || res.status === 204) {
    console.log('[Test] Apollo.io: Connected successfully.');
    return true;
  }

  // Some Apollo plans return 404 on /auth/health — try a minimal search instead
  const searchRes = await axios.post(
    `${config.apollo.baseUrl}/mixed_people/search`,
    {
      api_key: config.apollo.apiKey,
      q_organization_industries: ['HVAC'],
      person_locations: ['Michigan, United States'],
      per_page: 1,
      page: 1,
    },
    {
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.apollo.apiKey },
      validateStatus: () => true,
    }
  );

  if (searchRes.status === 200) {
    const count = searchRes.data?.people?.length ?? 0;
    console.log(`[Test] Apollo.io: Connected successfully. Test search returned ${count} result(s).`);
    return true;
  }

  throw new Error(
    `Apollo API returned status ${searchRes.status}: ${JSON.stringify(searchRes.data)}`
  );
}

async function testGoogleSheets() {
  if (!config.google.spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is missing from .env');
  }

  console.log('[Test] Connecting to Google Sheets...');
  const info = await testConnection();
  console.log(`[Test] Google Sheets: Connected. Spreadsheet: "${info.title}" (${info.sheetCount} sheet(s)).`);
  return true;
}

(async () => {
  let allPassed = true;

  try {
    await testApollo();
  } catch (err) {
    console.error(`[Test] Apollo.io FAILED: ${err.message}`);
    allPassed = false;
  }

  try {
    await testGoogleSheets();
  } catch (err) {
    console.error(`[Test] Google Sheets FAILED: ${err.message}`);
    allPassed = false;
  }

  if (allPassed) {
    console.log('\nAll connection tests passed. You are ready to run the scheduler.\n');
    process.exit(0);
  } else {
    console.error('\nOne or more connection tests failed. Fix the errors above before starting.\n');
    process.exit(1);
  }
})();
