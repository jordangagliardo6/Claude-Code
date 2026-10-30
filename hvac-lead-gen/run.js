'use strict';

/**
 * Manual run + first-time connection test.
 *
 * Usage:
 *   node run.js           — run the lead generator right now (same as scheduled run)
 *   node run.js --test    — test connectivity to Apollo and Google Sheets only (no writes)
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { run }   = require('./src/leadGenerator');
const apollo    = require('./src/apollo');
const sheets    = require('./src/sheets');
const notifier  = require('./src/notifier');

const isTestMode = process.argv.includes('--test');

async function testConnections() {
  console.log('\n=== HVAC Lead Gen — Connection Test ===\n');

  // ── Apollo ────────────────────────────────────────────────────────────────
  console.log('1. Testing Apollo.io…');
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    console.error('   FAIL: APOLLO_API_KEY is not set in .env');
    process.exit(1);
  }
  try {
    // Search for just 1 result as a connectivity ping
    const leads = await apollo.searchLeads(apolloKey, 1);
    console.log(`   OK — Apollo responded. Sample result count: ${leads.length}`);
    if (leads.length > 0) {
      const l = leads[0];
      console.log(`   Sample lead: ${l.businessName} | ${l.firstName} ${l.lastName} | ${l.phone} | ${l.city}`);
    }
  } catch (err) {
    console.error(`   FAIL: ${err.message}`);
    process.exit(1);
  }

  // ── Google Sheets ─────────────────────────────────────────────────────────
  console.log('\n2. Testing Google Sheets…');
  const keyFile       = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const tabName       = process.env.GOOGLE_SHEET_TAB || 'Sheet1';

  if (!keyFile || !spreadsheetId) {
    console.error('   FAIL: GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SPREADSHEET_ID not set in .env');
    process.exit(1);
  }
  try {
    await sheets.testConnection(keyFile, spreadsheetId, tabName);
    console.log(`   OK — Google Sheets connected (spreadsheetId: ${spreadsheetId}, tab: ${tabName})`);
  } catch (err) {
    console.error(`   FAIL: ${err.message}`);
    console.error('\n   Common fixes:');
    console.error('   • Make sure GOOGLE_SERVICE_ACCOUNT_KEY_FILE points to a valid JSON key file');
    console.error('   • Share the spreadsheet with the service account email (found in the JSON key)');
    console.error('   • Enable the Google Sheets API in your Google Cloud project');
    process.exit(1);
  }

  console.log('\n=== All connections OK — ready to run! ===');
  console.log('Run "node run.js" (without --test) to pull your first batch of leads.\n');
}

async function main() {
  if (isTestMode) {
    await testConnections();
  } else {
    try {
      const result = await run();
      console.log(`\nDone. Added: ${result.added} | Skipped (dupes): ${result.skipped}`);
    } catch (err) {
      await notifier.notifyError('Manual run failed', err.stack || err.message);
      process.exit(1);
    }
  }
}

main();
