// ---------------------------------------------------------------------------
// Verifies both Apollo and Google Sheets are reachable BEFORE you turn on
// the schedule. Run with: npm run test-connections
// ---------------------------------------------------------------------------

require('dotenv').config();
const axios = require('axios');
const sheets = require('../src/googleSheetsClient');

async function testApollo() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY is not set in .env');
  }
  // Minimal, cheap request just to confirm the key authenticates.
  const response = await axios.post(
    'https://api.apollo.io/api/v1/mixed_people/search',
    { per_page: 1, page: 1 },
    { headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' } }
  );
  const total = response.data?.pagination?.total_entries ?? 'unknown';
  return `Apollo API key is valid. (Sanity-check search returned ${total} total entries.)`;
}

async function testGoogleSheets() {
  const { spreadsheetTitle, tabNames } = await sheets.verifyAccess();
  return `Connected to spreadsheet "${spreadsheetTitle}". Tabs found: ${tabNames.join(', ')}`;
}

async function main() {
  console.log('Testing connections...\n');
  let ok = true;

  try {
    console.log('[Apollo]', await testApollo());
  } catch (err) {
    ok = false;
    console.error('[Apollo] FAILED:', err.response?.data?.error || err.message);
  }

  try {
    console.log('[Google Sheets]', await testGoogleSheets());
  } catch (err) {
    ok = false;
    console.error('[Google Sheets] FAILED:', err.message);
  }

  console.log('\n' + (ok ? 'All connections OK. Safe to enable the schedule (npm start).' : 'One or more connections FAILED. Fix the issues above before enabling the schedule.'));
  process.exit(ok ? 0 : 1);
}

main();
