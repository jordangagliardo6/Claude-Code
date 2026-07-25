'use strict';

/**
 * Pre-flight connection test.
 *
 * Run before your first scheduled execution to confirm both APIs are wired up:
 *   npm run test-connection
 *
 * This script does NOT write to your sheet. It only reads one cell and
 * performs one Apollo search to verify credentials and access.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const ApolloClient       = require('./apollo');
const GoogleSheetsClient = require('./sheets');
const { getGoogleAuth }  = require('./auth');

async function testConnections() {
  let allOk = true;

  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log('│         Apollo Lead Gen — Connection Test               │');
  console.log('└─────────────────────────────────────────────────────────┘\n');

  // ── 1. Environment variables ──────────────────────────────────────────────
  console.log('── Environment Variables ──────────────────────────────────');
  const required = {
    APOLLO_API_KEY:       process.env.APOLLO_API_KEY,
    GOOGLE_SPREADSHEET_ID: process.env.GOOGLE_SPREADSHEET_ID,
    GOOGLE_CREDENTIALS_FILE: process.env.GOOGLE_CREDENTIALS_FILE,
    GOOGLE_AUTH_METHOD:   process.env.GOOGLE_AUTH_METHOD,
  };

  for (const [key, val] of Object.entries(required)) {
    if (val) {
      const display = key === 'APOLLO_API_KEY'
        ? val.slice(0, 6) + '…' + val.slice(-4)
        : val;
      console.log(`  ✅  ${key}: ${display}`);
    } else {
      console.log(`  ❌  ${key}: NOT SET`);
      allOk = false;
    }
  }

  // ── 2. Apollo.io API ──────────────────────────────────────────────────────
  console.log('\n── Apollo.io API ──────────────────────────────────────────');
  if (!process.env.APOLLO_API_KEY) {
    console.log('  ⏭   Skipped (no API key)');
  } else {
    try {
      const apollo  = new ApolloClient(process.env.APOLLO_API_KEY);
      const result  = await apollo.testConnection();
      if (result.ok) {
        console.log(`  ✅  Connected. Test search returned ${result.totalResults} total results.`);
      } else {
        console.log(`  ❌  Connection failed: ${result.error}`);
        allOk = false;
      }
    } catch (err) {
      console.log(`  ❌  Unexpected error: ${err.message}`);
      allOk = false;
    }
  }

  // ── 3. Google Sheets ──────────────────────────────────────────────────────
  console.log('\n── Google Sheets / Drive ──────────────────────────────────');
  if (!process.env.GOOGLE_SPREADSHEET_ID) {
    console.log('  ⏭   Skipped (no spreadsheet ID)');
  } else {
    try {
      const auth   = await getGoogleAuth();
      const sheets = new GoogleSheetsClient(
        auth,
        process.env.GOOGLE_SPREADSHEET_ID,
        process.env.GOOGLE_SHEET_TAB ?? 'Leads'
      );
      const result = await sheets.testConnection();
      if (result.ok) {
        console.log('  ✅  Connected. Successfully read from spreadsheet.');
      } else {
        console.log(`  ❌  Connection failed: ${result.error}`);
        allOk = false;
      }
    } catch (err) {
      console.log(`  ❌  Auth/connection error: ${err.message}`);
      allOk = false;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  if (allOk) {
    console.log('✅  All checks passed! You are ready to run.\n');
    console.log('Next steps:');
    console.log('  • Run once now:        npm run run-once');
    console.log('  • Start the scheduler: npm start\n');
  } else {
    console.log('❌  Some checks failed. Fix the issues above, then re-run:\n');
    console.log('  npm run test-connection\n');
    console.log('See SETUP.md for detailed instructions.\n');
    process.exit(1);
  }
}

testConnections().catch((err) => {
  console.error('\n[test-connection] Fatal error:', err.message);
  process.exit(1);
});
