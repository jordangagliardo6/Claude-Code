/**
 * Entry point
 *
 * Usage:
 *   node index.js                  — start the daily scheduler
 *   node index.js --test           — run connection test only
 *   node index.js --run-once       — execute one workflow run immediately, then exit
 */

require('dotenv').config();

const args = process.argv.slice(2);

if (args.includes('--test')) {
  require('./src/test-connection');
} else if (args.includes('--run-once')) {
  const { runWorkflow } = require('./src/workflow');
  runWorkflow()
    .then((result) => {
      console.log('[Done]', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('[Fatal]', err);
      process.exit(1);
    });
} else {
  // Default: start the scheduler and keep the process alive
  const { startScheduler } = require('./src/scheduler');
  startScheduler();
  console.log('[HVAC Lead Gen] Scheduler running. Press Ctrl+C to stop.');
}
