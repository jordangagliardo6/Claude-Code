// ─── Connection Test ─────────────────────────────────────────────────────────
// Run this BEFORE starting the scheduler to confirm both APIs are reachable.
//
//   node test-connection.js
// ────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const axios = require('axios');
const { testConnection } = require('./sheets');
const config = require('./config');

async function main() {
  let allPassed = true;

  console.log('\n══════════════════════════════════════');
  console.log('  HVAC Lead Gen — Connection Test');
  console.log('══════════════════════════════════════\n');

  // ── 1. Check .env ─────────────────────────────────────────────────────────
  console.log('① Checking environment variables...');
  const required = ['APOLLO_API_KEY', 'SPREADSHEET_ID'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`  ✗ Missing: ${missing.join(', ')}`);
    console.error('    Copy .env.example → .env and fill in your values.\n');
    allPassed = false;
  } else {
    console.log('  ✓ All required env vars present\n');
  }

  // ── 2. Test Apollo API key ────────────────────────────────────────────────
  console.log('② Testing Apollo.io API key...');
  try {
    const res = await axios.get('https://api.apollo.io/v1/auth/health', {
      headers: { 'X-Api-Key': process.env.APOLLO_API_KEY },
    });
    if (res.data?.is_logged_in) {
      console.log('  ✓ Apollo API key is valid');
      console.log(`  ✓ Logged in as: ${res.data.email || '(email not returned)'}\n`);
    } else {
      console.warn('  ⚠ Apollo responded but is_logged_in is false — double-check your API key\n');
      allPassed = false;
    }
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error(`  ✗ Apollo error: ${msg}`);
    if (msg.includes('not included in your Free plan')) {
      console.error('  ✗ Your Apollo plan does not include People Search.');
      console.error('    Upgrade at https://www.apollo.io/pricing (Basic plan or higher required).\n');
    }
    allPassed = false;
  }

  // ── 3. Test Google Sheets ─────────────────────────────────────────────────
  console.log('③ Testing Google Sheets access...');
  try {
    const title = await testConnection(config.sheets.spreadsheetId);
    console.log(`  ✓ Connected to spreadsheet: "${title}"`);
    console.log(`  ✓ URL: https://docs.google.com/spreadsheets/d/${config.sheets.spreadsheetId}\n`);
  } catch (err) {
    console.error(`  ✗ Google Sheets error: ${err.message}`);
    if (err.message.includes('no such file')) {
      console.error('    credentials.json not found. See SETUP.md step 2.\n');
    } else if (err.message.includes('403') || err.message.includes('permission')) {
      console.error('    Share the spreadsheet with your service account email (Editor role).\n');
    }
    allPassed = false;
  }

  // ── 4. Summary ────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════');
  if (allPassed) {
    console.log('  ✓ All checks passed — ready to run!');
    console.log('  Start the scheduler: npm start');
  } else {
    console.log('  ✗ Some checks failed — fix the issues above before starting.');
  }
  console.log('══════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Unexpected error during connection test:', err.message);
  process.exit(1);
});
