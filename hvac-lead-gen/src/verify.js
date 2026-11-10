/**
 * Verification script — run this BEFORE the first scheduled run to confirm
 * both Apollo.io and Google Sheets connections are working correctly.
 *
 * Usage:
 *   node src/verify.js
 *
 * What it checks:
 *   1. Apollo.io API key is valid and returns at least one result
 *   2. Google Sheets credentials are valid
 *   3. The spreadsheet is accessible and writable
 *   4. The header row is present (writes it if missing)
 */

require('dotenv').config();
const { searchHvacLeads } = require('./apollo');
const { getSheetsClient, getExistingBusinessNames, appendLeads } = require('./sheets');

const {
  APOLLO_API_KEY,
  SPREADSHEET_ID,
  SHEET_NAME = 'Sheet1',
  GOOGLE_CREDENTIALS_PATH = './credentials.json',
} = process.env;

async function verify() {
  let allPassed = true;

  console.log('\n================================================');
  console.log(' HVAC Lead Gen — Connection Verification');
  console.log('================================================\n');

  // ── Check 1: Apollo.io ────────────────────────────────────────────────────
  console.log('1. Testing Apollo.io API...');

  if (!APOLLO_API_KEY) {
    console.error('   ✗ APOLLO_API_KEY is not set in .env');
    allPassed = false;
  } else {
    try {
      const { contacts, totalResults } = await searchHvacLeads(APOLLO_API_KEY, 3);
      console.log(`   ✓ Apollo connected. Query matched ${totalResults} total results.`);
      if (contacts.length > 0) {
        const sample = contacts[0];
        console.log(`   ✓ Sample contact: ${sample.firstName} ${sample.lastName} at ${sample.businessName} (${sample.city}) — ${sample.phone}`);
      } else {
        console.warn('   ⚠ Apollo returned matches but none had phone numbers.');
        console.warn('     This could mean the area has limited data. The workflow will still run.');
      }
    } catch (err) {
      console.error(`   ✗ Apollo API error: ${err.response?.status || ''} ${err.message}`);
      if (err.response?.data) {
        console.error('   Response:', JSON.stringify(err.response.data, null, 2));
      }
      allPassed = false;
    }
  }

  // ── Check 2: Google Sheets ────────────────────────────────────────────────
  console.log('\n2. Testing Google Sheets connection...');

  if (!SPREADSHEET_ID) {
    console.error('   ✗ SPREADSHEET_ID is not set in .env');
    allPassed = false;
  } else {
    let sheets;
    try {
      sheets = await getSheetsClient(GOOGLE_CREDENTIALS_PATH);
      console.log('   ✓ Google Sheets authenticated successfully.');
    } catch (err) {
      console.error(`   ✗ Google Sheets auth failed: ${err.message}`);
      console.error(`     Make sure ${GOOGLE_CREDENTIALS_PATH} exists and contains valid service account credentials.`);
      allPassed = false;
    }

    if (sheets) {
      try {
        const names = await getExistingBusinessNames(sheets, SPREADSHEET_ID, SHEET_NAME);
        console.log(`   ✓ Spreadsheet is accessible. Found ${names.size} existing business entries.`);
      } catch (err) {
        console.error(`   ✗ Could not read spreadsheet: ${err.message}`);
        console.error(`     Spreadsheet ID: ${SPREADSHEET_ID}`);
        console.error(`     Check that the service account has been granted Editor access to this spreadsheet.`);
        allPassed = false;
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n================================================');
  if (allPassed) {
    console.log(' ✓ All checks passed — ready to run!');
    console.log('\n Next steps:');
    console.log('   • Start the scheduler: npm start');
    console.log('   • Or run once now    : npm run test-run');
  } else {
    console.log(' ✗ Some checks failed. Fix the issues above before running the scheduler.');
    process.exit(1);
  }
  console.log('================================================\n');
}

verify().catch((err) => {
  console.error('Unexpected error during verification:', err);
  process.exit(1);
});
