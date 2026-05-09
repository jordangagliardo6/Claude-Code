/**
 * Connection test — run this BEFORE starting the scheduler for the first time.
 *
 * Usage:
 *   npm run test-connection
 *   node src/test-connection.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { testConnection: testApollo }  = require('./apollo');
const { testConnection: testSheets }  = require('./sheets');

const CHECK  = '\x1b[32m✓\x1b[0m';
const CROSS  = '\x1b[31m✗\x1b[0m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

async function run() {
  console.log(`\n${BOLD}══════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  HVAC Lead Generator — Connection Test${RESET}`);
  console.log(`${BOLD}══════════════════════════════════════════════${RESET}\n`);

  // ── Apollo ────────────────────────────────────────────────────────────────
  process.stdout.write('  Testing Apollo.io…      ');
  const apollo = await testApollo();
  console.log(apollo.success ? `${CHECK} ${apollo.message}` : `${CROSS} ${apollo.message}`);

  // ── Google Sheets ─────────────────────────────────────────────────────────
  process.stdout.write('  Testing Google Sheets… ');
  const sheets = await testSheets();
  console.log(sheets.success ? `${CHECK} ${sheets.message}` : `${CROSS} ${sheets.message}`);

  console.log('');

  // ── Summary ───────────────────────────────────────────────────────────────
  if (apollo.success && sheets.success) {
    console.log(`${BOLD}══════════════════════════════════════════════${RESET}`);
    console.log(`  ${CHECK} ${BOLD}ALL CONNECTIONS SUCCESSFUL${RESET}`);
    console.log('');
    console.log('  The system is ready to run.');
    console.log('');
    console.log('  • Start the scheduler (runs daily at 7 AM ET):');
    console.log('      npm start');
    console.log('');
    console.log('  • Run the workflow manually right now:');
    console.log('      npm run run-now');
    console.log(`${BOLD}══════════════════════════════════════════════${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${BOLD}══════════════════════════════════════════════${RESET}`);
    console.log(`  ${CROSS} ${BOLD}ONE OR MORE CONNECTIONS FAILED${RESET}`);
    console.log('  Fix the issues above, then re-run this test.');
    console.log(`${BOLD}══════════════════════════════════════════════${RESET}\n`);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('\nUnexpected error during connection test:', err.message);
  process.exit(1);
});
