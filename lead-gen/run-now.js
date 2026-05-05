'use strict';

/**
 * run-now.js — trigger one immediate lead-gen run without waiting for cron.
 *
 * Useful for:
 *   - Testing after initial setup
 *   - Manually filling the sheet on-demand
 *   - Debugging specific behaviour
 *
 * Usage:  node run-now.js
 */

require('dotenv').config();
const workflow = require('./src/workflow');
const logger = require('./src/logger');

(async () => {
  logger.info('Manual run triggered via run-now.js');

  const summary = await workflow.run();

  console.log('\n── Run Summary ──────────────────────────');
  console.log(`  Contacts fetched from Apollo : ${summary.fetched}`);
  console.log(`  Duplicates skipped           : ${summary.duplicatesSkipped}`);
  console.log(`  New rows added to sheet      : ${summary.added}`);
  console.log(`  Error                        : ${summary.error ?? 'none'}`);
  console.log('─────────────────────────────────────────\n');

  process.exit(summary.error ? 1 : 0);
})();
