require('dotenv').config();

const cron           = require('node-cron');
const { runWorkflow } = require('./workflow');
const logger         = require('./logger');

// 7:00 AM Eastern Time daily.
// node-cron accepts an IANA timezone string, so this always fires at 07:00
// regardless of the server's local clock.
const SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';
const TIMEZONE  = 'America/New_York';

logger.info(`Scheduler ready. Cron expression: "${SCHEDULE}" (${TIMEZONE})`);
logger.info('Workflow fires daily at 7:00 AM Eastern Time. Press Ctrl+C to stop.');

cron.schedule(
  SCHEDULE,
  async () => {
    logger.info('Cron triggered — launching workflow...');
    try {
      await runWorkflow();
    } catch (err) {
      // Error already logged + alerted inside runWorkflow; don't crash the scheduler
      logger.error(`Scheduled run failed: ${err.message}`);
    }
  },
  { timezone: TIMEZONE }
);
