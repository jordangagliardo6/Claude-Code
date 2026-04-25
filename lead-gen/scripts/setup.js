/**
 * Setup / connection test script.
 * Run this before your first scheduled run to confirm both APIs are reachable.
 *
 * Usage:  npm run setup
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const logger = require('../src/logger');
const apollo = require('../src/apollo');
const sheets = require('../src/sheets');
const config = require('../src/config');

async function main() {
  let passed = 0;
  let failed = 0;

  console.log('\n======================================================');
  console.log('  HVAC Lead Gen — Connection & Setup Verification');
  console.log('======================================================\n');

  // ── Check 1: Environment variables ────────────────────────────
  console.log('[ 1/4 ] Checking environment variables...');
  const required = { APOLLO_API_KEY: config.apollo.apiKey, GOOGLE_SPREADSHEET_ID: config.google.spreadsheetId };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);

  if (missing.length > 0) {
    console.error(`  FAIL — Missing: ${missing.join(', ')}`);
    console.error('         Copy .env.example to .env and fill in your values.\n');
    failed++;
  } else {
    console.log('  PASS — All required env vars are set\n');
    passed++;
  }

  // ── Check 2: Apollo.io connectivity ───────────────────────────
  console.log('[ 2/4 ] Testing Apollo.io connection...');
  try {
    await apollo.testConnection();
    console.log('  PASS — Apollo.io authenticated successfully\n');
    passed++;
  } catch (err) {
    console.error(`  FAIL — ${err.message}\n`);
    failed++;
  }

  // ── Check 3: Google Sheets connectivity ───────────────────────
  console.log('[ 3/4 ] Testing Google Sheets connection...');
  try {
    const title = await sheets.testConnection();
    console.log(`  PASS — Connected to spreadsheet: "${title}"\n`);
    passed++;
  } catch (err) {
    console.error(`  FAIL — ${err.message}\n`);
    failed++;
  }

  // ── Check 4: Header row ───────────────────────────────────────
  console.log('[ 4/4 ] Ensuring spreadsheet header row exists...');
  try {
    await sheets.ensureHeaders();
    console.log(`  PASS — Headers confirmed: ${config.columns.join(' | ')}\n`);
    passed++;
  } catch (err) {
    console.error(`  FAIL — ${err.message}\n`);
    failed++;
  }

  // ── Summary ───────────────────────────────────────────────────
  console.log('======================================================');
  if (failed === 0) {
    console.log(`  ALL CHECKS PASSED (${passed}/${passed + failed})`);
    console.log('\n  Next steps:');
    console.log('    • Run "npm run run-now" to do a test pull right now');
    console.log('    • Run "npm start" to start the 7 AM daily scheduler');
    console.log(`    • Spreadsheet: https://docs.google.com/spreadsheets/d/${config.google.spreadsheetId}/edit`);
  } else {
    console.log(`  ${failed} CHECK(S) FAILED — fix the issues above before starting the scheduler`);
  }
  console.log('======================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unexpected error during setup:', err.message);
  process.exit(1);
});
