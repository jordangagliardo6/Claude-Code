'use strict';

/**
 * First-run connectivity check.
 * Run this before starting the scheduler to confirm:
 *   • Apollo.io API key is valid
 *   • Google Sheets credentials are authorized and the sheet is accessible
 *
 * Usage:  npm run check
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const config = require('./config');
const apollo = require('./apollo');
const sheets = require('./sheets');

async function main() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  HVAC Lead Scraper — Setup Check');
  console.log('════════════════════════════════════════════════════════════\n');

  // ── 1. Validate environment variables ──────────────────────────────────────
  console.log('1. Checking environment variables…');
  const missing = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID'].filter((v) => !process.env[v]);
  if (missing.length) {
    console.error(`   ✗ Missing: ${missing.join(', ')}`);
    console.error('   Copy .env.example → .env and fill in the values.\n');
    process.exit(1);
  }
  console.log('   ✓ APOLLO_API_KEY is set');
  console.log('   ✓ GOOGLE_SHEET_ID is set');

  // ── 2. Test Apollo.io connection ───────────────────────────────────────────
  console.log('\n2. Testing Apollo.io connection…');
  const apolloResult = await apollo.testConnection();
  if (apolloResult.ok) {
    console.log(`   ✓ ${apolloResult.message}`);
  } else {
    console.error(`   ✗ ${apolloResult.message}`);
    process.exit(1);
  }

  // ── 3. Test Google Sheets connection (triggers OAuth flow if needed) ────────
  console.log('\n3. Testing Google Sheets connection…');
  console.log('   (If this is your first run, a browser auth URL will appear below.)');
  const sheetsResult = await sheets.testConnection();
  if (sheetsResult.ok) {
    console.log(`   ✓ ${sheetsResult.message}`);
  } else {
    console.error(`   ✗ ${sheetsResult.message}`);
    process.exit(1);
  }

  // ── 4. Summary ────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  All checks passed!');
  console.log('  Run `npm start` to start the 7 AM daily scheduler.');
  console.log('  Run `npm run run-once` to execute a one-off pull right now.');
  console.log('════════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error(`\nSetup check failed: ${err.message}\n`);
  process.exit(1);
});
