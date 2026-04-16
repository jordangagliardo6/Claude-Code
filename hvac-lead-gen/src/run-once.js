/**
 * run-once.js
 * Executes a single lead-gen run immediately, then exits.
 *
 * Useful for:
 *   • Testing the workflow end-to-end
 *   • Triggering a manual run outside of the scheduled window
 *   • Running from an external cron (crontab) instead of node-cron
 *
 * Usage:
 *   node src/run-once.js
 *   npm run run-once
 */

require('dotenv').config();

const { runWorkflow } = require('./workflow');
const { logger }      = require('./notifier');

(async () => {
  logger.info('Manual run triggered (run-once.js)');
  const result = await runWorkflow();

  if (result.error) {
    logger.error(`Run finished with error: ${result.error}`);
    process.exit(1);
  } else {
    logger.info(`Run finished — ${result.inserted} inserted, ${result.skipped} skipped.`);
    process.exit(0);
  }
})();
