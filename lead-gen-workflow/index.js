/**
 * Entry point — starts the node-cron scheduler
 *
 * Runs the lead generation workflow every day at 7:00 AM Eastern Time.
 * To change the schedule, edit the CRON_SCHEDULE variable below.
 *
 * Usage:
 *   node index.js              Start the daemon (keeps running)
 *   npm run run-now            Run the workflow once immediately and exit
 *   npm run setup              Verify API connections before first scheduled run
 */

'use strict';

require('dotenv').config();

const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');
const logger = require('./src/logger');

// ─── Schedule ────────────────────────────────────────────────────────────────
// "0 7 * * *" = every day at 7:00 AM
// node-cron uses the system timezone, so we set TZ=America/New_York in .env
// to keep it pinned to Eastern Time regardless of the server's local clock.
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';

// ─── Validate env vars before starting ───────────────────────────────────────
function validateEnv() {
  const required = ['APOLLO_API_KEY', 'SPREADSHEET_ID'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    logger.error('Copy .env.example to .env and fill in the values, then restart.');
    process.exit(1);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
validateEnv();

logger.info('Lead Gen Workflow scheduler started');
logger.info(`Schedule: ${CRON_SCHEDULE} (timezone: ${process.env.TZ || 'system default'})`);
logger.info('Waiting for next scheduled run... (use `npm run run-now` to run immediately)');

cron.schedule(
  CRON_SCHEDULE,
  async () => {
    try {
      await runWorkflow();
    } catch (err) {
      // Belt-and-suspenders: workflow.js catches its own errors, but we log
      // any unexpected uncaught exception here too.
      logger.error(`Unhandled error in scheduled run: ${err.message}`, {
        stack: err.stack,
      });
    }
  },
  {
    timezone: process.env.TZ || 'America/New_York',
  }
);

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Scheduler stopped (SIGINT)');
  process.exit(0);
});
process.on('SIGTERM', () => {
  logger.info('Scheduler stopped (SIGTERM)');
  process.exit(0);
});
