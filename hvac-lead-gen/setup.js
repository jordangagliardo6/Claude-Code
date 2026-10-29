/**
 * setup.js — First-run connection verification
 *
 * Run this once before the scheduler to confirm both Apollo.io and Google
 * Sheets are connected and reachable. It does NOT pull real leads or write
 * to the sheet — it only pings both APIs.
 *
 * Usage: node setup.js
 */

require('dotenv').config();
const axios = require('axios');
const path = require('path');
const { getAuthClient } = require('./src/sheets');
const { google } = require('googleapis');

const config = {
  apolloApiKey:    process.env.APOLLO_API_KEY,
  sheetId:         process.env.GOOGLE_SHEET_ID,
  sheetTab:        process.env.GOOGLE_SHEET_TAB ?? 'Leads',
  credentialsPath: path.resolve(process.env.GOOGLE_CREDENTIALS_PATH ?? './credentials/google-credentials.json'),
  tokenPath:       path.resolve(process.env.GOOGLE_TOKEN_PATH ?? './credentials/token.json'),
};

async function checkApollo() {
  console.log('\n── Apollo.io connection check ──────────────────────────');
  if (!config.apolloApiKey) {
    console.error('  ✗ APOLLO_API_KEY is not set in .env');
    return false;
  }
  try {
    // Lightweight request: fetch account info
    const res = await axios.get('https://api.apollo.io/v1/auth/health', {
      headers: { 'x-api-key': config.apolloApiKey, 'Content-Type': 'application/json' },
      timeout: 10_000,
    });
    if (res.status === 200) {
      console.log('  ✓ Apollo.io API key is valid and reachable.');
      return true;
    }
  } catch (err) {
    const detail = err.response?.data?.message ?? err.message;
    console.error(`  ✗ Apollo.io error: ${detail}`);
    console.error('    Check that APOLLO_API_KEY in .env matches your key at developer.apollo.io');
  }
  return false;
}

async function checkGoogleSheets() {
  console.log('\n── Google Sheets connection check ──────────────────────');
  if (!config.sheetId) {
    console.error('  ✗ GOOGLE_SHEET_ID is not set in .env');
    return false;
  }
  try {
    // This may prompt for OAuth if no token is cached yet
    const auth = await getAuthClient(config.credentialsPath, config.tokenPath);
    const sheets = google.sheets({ version: 'v4', auth });

    // Just fetch the sheet metadata — no writes
    const res = await sheets.spreadsheets.get({ spreadsheetId: config.sheetId });
    const tabNames = res.data.sheets.map((s) => s.properties.title);
    console.log(`  ✓ Google Sheets connected. Spreadsheet: "${res.data.properties.title}"`);
    console.log(`    Tabs found: ${tabNames.join(', ')}`);
    if (!tabNames.includes(config.sheetTab)) {
      console.warn(`  ⚠ Tab "${config.sheetTab}" not found. It will be created on first run, OR set GOOGLE_SHEET_TAB to one of: ${tabNames.join(', ')}`);
    } else {
      console.log(`  ✓ Target tab "${config.sheetTab}" exists.`);
    }
    return true;
  } catch (err) {
    console.error(`  ✗ Google Sheets error: ${err.message}`);
    if (err.message.includes('credentials file not found')) {
      console.error('    Download google-credentials.json from Google Cloud Console and place it at:');
      console.error(`    ${config.credentialsPath}`);
    }
  }
  return false;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        HVAC Lead Gen — First-Run Setup Verification      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const apolloOk = await checkApollo();
  const sheetsOk = await checkGoogleSheets();

  console.log('\n── Summary ─────────────────────────────────────────────────');
  console.log(`  Apollo.io    : ${apolloOk ? '✓ Connected' : '✗ Not connected'}`);
  console.log(`  Google Sheets: ${sheetsOk ? '✓ Connected' : '✗ Not connected'}`);

  if (apolloOk && sheetsOk) {
    console.log('\n  All systems go! You can now start the scheduler:');
    console.log('    node index.js           — start scheduler (runs at 7 AM ET daily)');
    console.log('    node index.js --run-now — run immediately right now\n');
    process.exit(0);
  } else {
    console.log('\n  Fix the issues above, then run `node setup.js` again.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected setup error:', err.message);
  process.exit(1);
});
