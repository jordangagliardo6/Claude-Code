const cron = require('node-cron');
const { runLeadGeneration } = require('./workflow');
const { CRON_SCHEDULE, CRON_TIMEZONE } = require('./config');
const logger = require('./logger');

/**
 * Start the daily scheduler.
 * Default: 7:00am America/New_York every day.
 * To change the time, edit CRON_SCHEDULE / CRON_TIMEZONE in src/config.js.
 */
function startScheduler() {
  if (!cron.validate(CRON_SCHEDULE)) {
    throw new Error(`Invalid cron expression: "${CRON_SCHEDULE}"`);
  }

  logger.info(`Scheduler armed — will run at: ${CRON_SCHEDULE} (${CRON_TIMEZONE})`);

  cron.schedule(
    CRON_SCHEDULE,
    async () => {
      logger.info('Cron fired — starting scheduled lead generation...');
      await runLeadGeneration();
    },
    { timezone: CRON_TIMEZONE }
  );
}

module.exports = { startScheduler };
