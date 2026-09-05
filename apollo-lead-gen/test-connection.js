/**
 * test-connection.js
 * Run this BEFORE starting the scheduler to confirm both APIs are connected.
 *
 * Usage:
 *   node test-connection.js
 *
 * What it checks:
 *   1. APOLLO_API_KEY is set and can reach the Apollo API
 *   2. GOOGLE_SERVICE_ACCOUNT_KEY_FILE points to a valid key file
 *   3. The service account has access to the configured spreadsheet
 *   4. Does a live preview fetch (no data is written)
 */

require('dotenv').config();
const { testConnection: testApollo } = require('./apolloSearch');
const { testConnection: testSheets, getExistingBusinessNames } = require('./googleSheets');
const config = require('./config');

function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); }
function section(title) { console.log(`\n── ${title} ──`); }

async function run() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Apollo HVAC Lead Gen — Connection Test     ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  let allGood = true;

  // ─── ENV VARS ─────────────────────────────────────────────────────────────
  section('Environment Variables');

  if (process.env.APOLLO_API_KEY) {
    pass(`APOLLO_API_KEY is set (${process.env.APOLLO_API_KEY.slice(0, 6)}...)`);
  } else {
    fail('APOLLO_API_KEY is not set — add it to your .env file');
    allGood = false;
  }

  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    pass(`GOOGLE_SERVICE_ACCOUNT_KEY_FILE is set → ${process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE}`);
  } else {
    fail('GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set — add it to your .env file');
    allGood = false;
  }

  if (!allGood) {
    console.log('\nFix the missing env vars above, then re-run this test.\n');
    process.exit(1);
  }

  // ─── APOLLO ───────────────────────────────────────────────────────────────
  section('Apollo.io API');
  console.log(`  Testing key against: ${config.cities[0]}...`);

  const apolloResult = await testApollo();
  if (apolloResult.ok) {
    pass('Apollo API connected successfully');
  } else {
    fail(`Apollo API failed: ${apolloResult.error}`);
    if (apolloResult.error && apolloResult.error.includes('not included in your')) {
      console.error('\n  ⚠  Your Apollo plan does not include the People Search API.');
      console.error('  Upgrade at https://www.apollo.io/pricing (Basic plan and above).');
    }
    allGood = false;
  }

  // ─── GOOGLE SHEETS ────────────────────────────────────────────────────────
  section('Google Sheets');
  console.log(`  Spreadsheet ID: ${config.spreadsheetId}`);

  const sheetsResult = await testSheets();
  if (sheetsResult.ok) {
    pass(`Connected to sheet: "${sheetsResult.title}"`);
    pass(`URL: ${sheetsResult.url}`);
  } else {
    fail(`Google Sheets failed: ${sheetsResult.error}`);
    console.error('\n  Check that:');
    console.error('    • The service account JSON file exists at the path you specified');
    console.error('    • The sheet has been shared with the service account email');
    console.error('    • The spreadsheet ID in config.js is correct');
    allGood = false;
  }

  if (sheetsResult.ok) {
    console.log('\n  Reading existing business names for dedup check...');
    try {
      const names = await getExistingBusinessNames();
      pass(`Found ${names.size} existing leads in the sheet`);
      if (names.size > 0) {
        const sample = [...names].slice(0, 3).join(', ');
        console.log(`  Sample: ${sample}${names.size > 3 ? ', ...' : ''}`);
      }
    } catch (err) {
      fail(`Could not read sheet data: ${err.message}`);
      allGood = false;
    }
  }

  // ─── RESULT ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  if (allGood) {
    console.log('✅  All connections OK — safe to start the scheduler.');
    console.log('\nRun:  node index.js');
    console.log('  OR: RUN_NOW=true node index.js   (run immediately + schedule)\n');
  } else {
    console.error('❌  One or more connections failed. Fix the issues above before starting.\n');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\nUnexpected error during connection test:');
  console.error(err.message || err);
  process.exit(1);
});
