/**
 * Manual trigger script — runs one complete workflow cycle immediately.
 * Useful for testing or for manually topping up the sheet outside the schedule.
 *
 * Usage:  npm run run-now
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const logger = require('../src/logger');
const { runWorkflow } = require('../src/workflow');

async function main() {
  logger.info('Manual run triggered via run-now.js');

  try {
    const result = await runWorkflow();
    logger.info(
      `Manual run finished — Added: ${result.added} | Skipped: ${result.skipped} | Total from Apollo: ${result.total}`
    );
    process.exit(0);
  } catch (err) {
    logger.error(`Manual run failed: ${err.message}`);
    if (err.stack) logger.error(err.stack);
    process.exit(1);
  }
}

main();
