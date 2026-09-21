/**
 * Connection tester — verifies Apollo and Google Sheets access before first run.
 * Run this before starting the scheduler to confirm everything is wired up.
 *
 *   node test-connection.js
 */

require('dotenv').config();

const axios = require('axios');
const config = require('./config');
const { getExistingBusinessNames } = require('./sheets');

async function testApollo() {
  console.log('\n--- Testing Apollo.io Connection ---');
  if (!config.apollo.apiKey) {
    console.error('  ✗ APOLLO_API_KEY not set in .env');
    return false;
  }

  try {
    const res = await axios.get('https://api.apollo.io/v1/auth/health', {
      headers: { 'X-Api-Key': config.apollo.apiKey },
      timeout: 10000,
    });
    if (res.data?.is_logged_in) {
      console.log('  ✓ Apollo connected');
      console.log(`  ✓ User: ${res.data.user?.name || 'unknown'} (${res.data.user?.email || ''})`);
      return true;
    }
    console.error('  ✗ Apollo responded but login status is false');
    return false;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error || err.message;
    console.error(`  ✗ Apollo connection failed (HTTP ${status}): ${msg}`);
    if (status === 401) console.error('    → Check that APOLLO_API_KEY is correct');
    return false;
  }
}

async function testApolloProspectingAccess() {
  console.log('\n--- Testing Apollo Prospecting API Access ---');
  try {
    const res = await axios.post(
      'https://api.apollo.io/v1/mixed_people/api_search',
      {
        person_titles: ['Owner'],
        person_locations: ['Kalamazoo, Michigan'],
        q_organization_keyword_tags: ['HVAC'],
        per_page: 1,
        page: 1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': config.apollo.apiKey,
        },
        timeout: 15000,
      }
    );
    console.log('  ✓ Prospecting API accessible (paid plan confirmed)');
    const count = res.data?.pagination?.total_entries ?? '?';
    console.log(`  ✓ Sample search found ~${count} HVAC owner contacts in Kalamazoo`);
    return true;
  } catch (err) {
    const status = err.response?.status;
    const code = err.response?.data?.error_code;
    if (code === 'API_INACCESSIBLE') {
      console.error('  ✗ Prospecting API not available on your current plan (Free)');
      console.error('    → Upgrade to Basic or above at https://www.apollo.io/pricing');
      console.error('    → This API costs 1 export credit per matched contact');
    } else {
      console.error(`  ✗ Prospecting API check failed (HTTP ${status}): ${err.response?.data?.error || err.message}`);
    }
    return false;
  }
}

async function testGoogleSheets() {
  console.log('\n--- Testing Google Sheets Connection ---');
  if (!config.google.spreadsheetId) {
    console.error('  ✗ SPREADSHEET_ID not set in .env');
    return false;
  }

  try {
    const existing = await getExistingBusinessNames();
    console.log('  ✓ Google Sheets connected');
    console.log(`  ✓ Spreadsheet ID: ${config.google.spreadsheetId}`);
    console.log(`  ✓ Existing businesses in sheet: ${existing.size}`);
    return true;
  } catch (err) {
    console.error(`  ✗ Google Sheets connection failed: ${err.message}`);
    if (err.message.includes('credentials')) {
      console.error('    → Check that credentials.json exists and is a valid service account key');
    } else if (err.message.includes('not found')) {
      console.error('    → Check SPREADSHEET_ID and make sure the service account has editor access to the sheet');
    } else if (err.message.includes('permission') || err.message.includes('403')) {
      console.error('    → Share the Google Sheet with the service account email address');
    }
    return false;
  }
}

(async () => {
  console.log('HVAC Lead Workflow — Connection Test');
  console.log('=====================================');

  const apolloOk = await testApollo();
  const prospectingOk = await testApolloProspectingAccess();
  const sheetsOk = await testGoogleSheets();

  console.log('\n--- Summary ---');
  console.log(`  Apollo connection:    ${apolloOk ? '✓ OK' : '✗ FAILED'}`);
  console.log(`  Prospecting API:      ${prospectingOk ? '✓ OK (paid plan)' : '✗ NEEDS UPGRADE'}`);
  console.log(`  Google Sheets:        ${sheetsOk ? '✓ OK' : '✗ FAILED'}`);

  if (apolloOk && prospectingOk && sheetsOk) {
    console.log('\n✓ All connections verified. Run `node run-once.js` to pull leads now,');
    console.log('  or `node index.js` to start the daily 7am scheduler.\n');
    process.exit(0);
  } else {
    console.log('\n✗ Fix the issues above before running the scheduler.\n');
    process.exit(1);
  }
})();
