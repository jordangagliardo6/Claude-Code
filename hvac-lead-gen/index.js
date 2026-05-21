/**
 * Entry point
 *
 * Usage:
 *   node index.js             → verify connections, then start 7am scheduler
 *   node index.js --verify    → verify connections only, then exit
 *   node index.js --run-now   → verify, run workflow once immediately, then schedule
 */

require('dotenv').config();

const { verifyConnection: verifyApollo }  = require('./src/apollo');
const { verifyConnection: verifySheets }  = require('./src/sheets');
const { runWorkflow }                     = require('./src/workflow');
const { startScheduler }                  = require('./src/scheduler');
const logger                              = require('./src/logger');

const args    = process.argv.slice(2);
const VERIFY  = args.includes('--verify');
const RUN_NOW = args.includes('--run-now');

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  HVAC Lead Gen — Southwest Michigan');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Verifying connections...\n');

  let apolloOk = false;
  let sheetsOk = false;

  try {
    const result = await verifyApollo();
    console.log(`  [OK] Apollo.io  — ${result.name} (${result.email})`);
    apolloOk = true;
  } catch (err) {
    console.error(`  [FAIL] Apollo.io — ${err.message}`);
    logger.error('Apollo connection failed', { message: err.message });
  }

  try {
    const result = await verifySheets();
    console.log(`  [OK] Google Sheets — "${result.title}"`);
    console.log(`       Tabs available: ${result.sheetNames.join(', ')}`);
    sheetsOk = true;
  } catch (err) {
    console.error(`  [FAIL] Google Sheets — ${err.message}`);
    logger.error('Google Sheets connection failed', { message: err.message });
  }

  console.log('');

  if (!apolloOk || !sheetsOk) {
    console.error('One or more connections failed. Fix the errors above, then re-run.\n');
    console.error('Refer to SETUP.md for step-by-step credential instructions.\n');
    process.exit(1);
  }

  console.log('Both connections verified successfully.\n');

  if (VERIFY) {
    console.log('--verify flag set — exiting without scheduling.\n');
    return;
  }

  if (RUN_NOW) {
    console.log('--run-now flag set — executing workflow now...\n');
    await runWorkflow();
    console.log('');
  }

  startScheduler();
  console.log('Scheduler is running — next execution at 7:00 AM Eastern.');
  console.log('Press Ctrl+C to stop.\n');
}

main().catch(err => {
  console.error(`\nFatal error: ${err.message}\n`);
  logger.error('Fatal startup error', { message: err.message, stack: err.stack });
  process.exit(1);
});
