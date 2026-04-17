const cron    = require('node-cron');
const logger  = require('./logger');

/**
 * Start the cron scheduler.
 * Fires every day at 7:00 AM Eastern Time (handles EST/EDT automatically).
 *
 * To change the schedule, edit the cron expression:
 *   '0 7 * * *'  →  minute=0, hour=7, every day
 * See https://crontab.guru for expression help.
 */
function startScheduler(workflowFn) {
  const CRON_EXPRESSION = '0 7 * * *';
  const TIMEZONE        = 'America/New_York';

  logger.info(`Scheduler armed: runs at 7:00 AM Eastern (${CRON_EXPRESSION} ${TIMEZONE})`);

  cron.schedule(CRON_EXPRESSION, async () => {
    logger.info(`Cron triggered at ${new Date().toLocaleString('en-US', { timeZone: TIMEZONE })}`);
    try {
      await workflowFn();
    } catch (err) {
      // Error was already logged and alerted inside workflowFn — just prevent crash
      logger.error(`Scheduled run failed: ${err.message}`);
    }
  }, { timezone: TIMEZONE });
}

module.exports = { startScheduler };
