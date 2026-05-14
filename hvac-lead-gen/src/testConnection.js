/**
 * Connection test — run this before your first scheduled run.
 *
 * Usage:
 *   node src/testConnection.js
 *
 * Tests both Apollo.io and Google Sheets connectivity and prints a clear
 * pass/fail for each service.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { testConnection: testApollo } = require('./apolloClient');
const { testConnection: testSheets } = require('./sheetsClient');

async function main() {
  console.log('\n━━━ HVAC Lead Gen — Connection Test ━━━\n');

  // ── Apollo.io ──────────────────────────────────────────────────────────────
  process.stdout.write('1. Apollo.io API key  ... ');
  try {
    const user = await testApollo();
    console.log(`✓  Connected (account: ${user.name || user.email || 'OK'})`);
  } catch (err) {
    console.log(`✗  FAILED — ${err.response?.data?.message || err.message}`);
    console.log('   → Check APOLLO_API_KEY in your .env file\n');
  }

  // ── Google Sheets ──────────────────────────────────────────────────────────
  process.stdout.write('2. Google Sheets       ... ');
  try {
    const title = await testSheets();
    console.log(`✓  Connected (spreadsheet: "${title}")`);
  } catch (err) {
    console.log(`✗  FAILED — ${err.message}`);
    console.log('   → Check GOOGLE_SERVICE_ACCOUNT_KEY_PATH and GOOGLE_SPREADSHEET_ID');
    console.log('   → Make sure you shared the sheet with the service account email\n');
  }

  console.log('\n━━━ Done ━━━\n');
  console.log('If both show ✓, run the workflow with:  npm start');
  console.log('For an immediate one-off run:            npm run run-once\n');
}

main().catch((err) => {
  console.error('\nUnexpected error during connection test:', err.message);
  process.exit(1);
});
