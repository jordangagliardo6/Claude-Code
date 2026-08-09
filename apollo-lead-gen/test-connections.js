/**
 * test-connections.js — Pre-flight check before the first scheduled run.
 *
 * Run: node test-connections.js
 *
 * Verifies:
 *   1. Apollo.io API key is valid and shows your plan + credit balance.
 *   2. Google Sheets service account can read your spreadsheet.
 *   3. The spreadsheet header row is in place (creates it if missing).
 *
 * Fix any ✗ failures before starting the scheduler.
 */

require('dotenv').config();
const axios = require('axios');
const { getExistingBusinessNames, ensureHeaderRow } = require('./sheets');

async function testConnections() {
  console.log('\n━━━ Apollo Lead Gen — Connection Test ━━━\n');

  let allPassed = true;

  // ── Test 1: Apollo API ─────────────────────────────────────────────────────
  console.log('1. Apollo.io API');
  try {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey || apiKey === 'your_apollo_api_key_here') {
      throw new Error('APOLLO_API_KEY is not set in your .env file.');
    }

    const res = await axios.post(
      'https://api.apollo.io/v1/users/api_profile',
      { api_key: apiKey },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const user = res.data?.user;
    console.log(`   ✓ Connected successfully`);
    console.log(`   ✓ Account email: ${user?.email || '(not returned)'}`);
    console.log(`   ✓ Organization:  ${user?.organization?.name || '(not returned)'}`);

    // Credit info if available
    if (res.data?.user?.usage) {
      const usage = res.data.user.usage;
      console.log(`   ✓ Credits used:  ${usage?.used ?? '?'} / ${usage?.limit ?? '?'}`);
    }
  } catch (err) {
    console.error(`   ✗ FAILED: ${err.response?.data?.message || err.message}`);
    if (err.response?.status === 401) {
      console.error(`   → Your API key is invalid. Get a new one at app.apollo.io → Settings → Integrations → API`);
    }
    allPassed = false;
  }

  // ── Test 2: Google Sheets ──────────────────────────────────────────────────
  console.log('\n2. Google Sheets');
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId || spreadsheetId === 'your_spreadsheet_id_here') {
      throw new Error('GOOGLE_SPREADSHEET_ID is not set in your .env file.');
    }

    // This reads the Business Name column — a lightweight real-world access check.
    const existing = await getExistingBusinessNames();
    console.log(`   ✓ Connected successfully`);
    console.log(`   ✓ Spreadsheet ID: ${spreadsheetId}`);
    console.log(`   ✓ Existing leads: ${existing.size} rows in the sheet`);
  } catch (err) {
    console.error(`   ✗ FAILED: ${err.message}`);
    if (err.message?.includes('404')) {
      console.error(`   → Spreadsheet not found. Double-check GOOGLE_SPREADSHEET_ID.`);
    } else if (err.message?.includes('403') || err.message?.includes('Permission denied')) {
      console.error(`   → Share the spreadsheet with your service account email (Editor role).`);
      console.error(`   → Find the email in your credentials/service-account-key.json → "client_email".`);
    } else if (err.message?.includes('service-account-key.json')) {
      console.error(`   → Service account key file not found.`);
      console.error(`   → Place it at: ${process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials/service-account-key.json'}`);
    }
    allPassed = false;
  }

  // ── Test 3: Ensure header row ──────────────────────────────────────────────
  if (allPassed) {
    console.log('\n3. Spreadsheet header row');
    try {
      await ensureHeaderRow();
      console.log(`   ✓ Header row is in place`);
    } catch (err) {
      console.error(`   ✗ FAILED: ${err.message}`);
      allPassed = false;
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  if (allPassed) {
    console.log('✓ All checks passed. You are ready to run the scheduler.\n');
    console.log('  Start scheduler:   node index.js');
    console.log('  Run immediately:   node index.js --run-now\n');
  } else {
    console.log('✗ One or more checks failed. Fix the errors above and re-run this test.\n');
    process.exit(1);
  }
}

testConnections().catch(err => {
  console.error('\nUnexpected error during connection test:', err.message);
  process.exit(1);
});
