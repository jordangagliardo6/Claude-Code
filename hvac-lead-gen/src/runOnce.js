/**
 * One-off run — fetches leads immediately without waiting for the cron schedule.
 *
 * Usage:
 *   node src/runOnce.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { run } = require('./leadGenerator');
const logger = require('./logger');

run()
  .then(({ fetched, added, skipped }) => {
    logger.success(`Manual run finished — fetched: ${fetched}, added: ${added}, skipped: ${skipped}`);
    process.exit(0);
  })
  .catch((err) => {
    logger.error('Manual run failed', err);
    process.exit(1);
  });
