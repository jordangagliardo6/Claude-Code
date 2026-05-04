'use strict';

require('dotenv').config();

const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');
const logger = require('./src/logger');

// ── Run-immediately mode ──────────────────────────────────────────────────────
// Usage: node index.js --now
if (process.argv.includes('--now')) {
  logger.info('--now flag detected — running workflow immediately');
  runWorkflow()
    .then(() => process.exit(0))
    .catch(err => {
      logger.error('Workflow exited with error', { message: err.message });
      process.exit(1);
    });
} else {
  // ── Scheduled mode ──────────────────────────────────────────────────────────
  // Runs every day at 7:00 AM Eastern Time.
  // To change the time, edit the cron expression below:
  //   '0 7 * * *'  →  minute=0, hour=7, every day
  //   '30 8 * * *' →  8:30 AM instead
  //   '0 7 * * 1-5'→  weekdays only
  const CRON_EXPRESSION = '0 7 * * *';
  const TIMEZONE = 'America/New_York';

  logger.info('HVAC Lead Gen Workflow — Scheduler Started');
  logger.info(`Schedule: ${CRON_EXPRESSION} (${TIMEZONE})`);
  logger.info('Next run: every day at 7:00 AM Eastern Time');
  logger.info('Tip: run  node index.js --now  to execute immediately');

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      logger.info('Scheduled trigger fired');
      try {
        await runWorkflow();
      } catch (err) {
        // Error is already logged + emailed inside runWorkflow; keep scheduler alive
        logger.error('Scheduler caught uncaught error — will retry at next scheduled time');
      }
    },
    {
      scheduled: true,
      timezone: TIMEZONE,
    }
  );
}
