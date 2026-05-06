'use strict';

/**
 * Cron scheduler — runs the workflow every morning at 7:00 AM Eastern Time.
 *
 * CRON_SCHEDULE env var overrides the default (e.g. "30 6 * * *" for 6:30 AM).
 * node-cron supports the standard 5-field cron syntax:
 *   ┌─ minute (0-59)
 *   │ ┌─ hour (0-23)
 *   │ │ ┌─ day of month (1-31)
 *   │ │ │ ┌─ month (1-12)
 *   │ │ │ │ ┌─ day of week (0-7, 0=Sun)
 *   │ │ │ │ │
 *   0 7 * * *   ← 7:00 AM every day
 */

const cron     = require('node-cron');
const { runWorkflow } = require('./workflow');
const logger   = require('./logger');

const SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';
const TIMEZONE = 'America/New_York'; // Eastern Time (handles EST/EDT automatically)

function startScheduler() {
  if (!cron.validate(SCHEDULE)) {
    throw new Error(`Invalid CRON_SCHEDULE: "${SCHEDULE}". Use standard 5-field cron syntax.`);
  }

  logger.info(`Scheduler started — runs at: ${SCHEDULE} (${TIMEZONE})`);
  logger.info('Process will stay alive. Press Ctrl+C to stop.');

  cron.schedule(SCHEDULE, async () => {
    logger.info('Cron triggered — starting workflow run...');
    try {
      const result = await runWorkflow();
      if (!result.success) {
        logger.error(`Workflow run failed: ${result.error}`);
      }
    } catch (err) {
      logger.error(`Unhandled error during scheduled run: ${err.message}`);
    }
  }, {
    scheduled: true,
    timezone: TIMEZONE,
  });
}

module.exports = { startScheduler };
