/**
 * Connection test — run this before your first scheduled run.
 * Confirms Apollo.io API key is valid and Google Sheets is accessible.
 *
 * Usage:
 *   node test-connection.js
 */

require('dotenv').config();

async function main() {
  console.log('Testing connections...\n');

  // Lazy-require after dotenv loads so env vars are available
  const { testApolloConnection }  = require('./src/apollo');
  const { testSheetsConnection }  = require('./src/sheets');

  // ── 1. Apollo.io ─────────────────────────────────────────────────────────
  process.stdout.write('1. Apollo.io API key ... ');
  const apolloOk = await testApolloConnection();
  console.log(apolloOk ? '✓ Connected' : '✗ FAILED');

  if (!apolloOk) {
    console.log('');
    console.log('   Fix: make sure APOLLO_API_KEY in .env matches your key at');
    console.log('        https://developer.apollo.io → Settings → API Keys');
  }

  // ── 2. Google Sheets ──────────────────────────────────────────────────────
  process.stdout.write('2. Google Sheets       ... ');
  const sheetsOk = await testSheetsConnection();
  console.log(sheetsOk ? '✓ Connected' : '✗ FAILED');

  if (!sheetsOk) {
    console.log('');
    console.log('   Checklist:');
    console.log('   • credentials.json exists at the path set in GOOGLE_CREDENTIALS_FILE');
    console.log('   • GOOGLE_SHEET_ID in .env is correct (from the spreadsheet URL)');
    console.log('   • The spreadsheet is shared with the service account email');
    console.log('     (find the email in credentials.json → "client_email")');
  }

  console.log('');
  if (apolloOk && sheetsOk) {
    console.log('✓ All systems go!\n');
    console.log('Next steps:');
    console.log('  1. Test a live pull:   node index.js --now');
    console.log('  2. Check your sheet — new leads should appear within ~30 seconds');
    console.log('  3. Start the scheduler: node index.js');
    console.log('     (or use pm2/systemd/nohup to keep it running in the background)');
  } else {
    console.log('✗ Resolve the error(s) above before starting the scheduler.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nUnexpected error during connection test:', err.message);
  process.exit(1);
});
