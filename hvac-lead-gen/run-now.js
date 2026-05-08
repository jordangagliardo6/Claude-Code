'use strict';

/**
 * run-now.js — Trigger one workflow run immediately without the cron scheduler.
 * Useful for testing, backfills, or manual runs.
 *
 *   node run-now.js
 */

require('dotenv').config();
const logger   = require('./src/logger');
const { runWorkflow } = require('./src/workflow');

(async () => {
  logger.log('Manual run triggered via run-now.js');

  try {
    const result = await runWorkflow();

    if (result.errors.length > 0) {
      logger.error('Run finished with errors. See above for details.');
      process.exit(1);
    }

    logger.log(`Done. Added: ${result.added} | Skipped (duplicates): ${result.skipped}`);
    process.exit(0);
  } catch (err) {
    logger.error(`Unexpected error: ${err.message}`);
    process.exit(1);
  }
})();
