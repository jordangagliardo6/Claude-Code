/**
 * Cron scheduler
 *
 * Runs the lead-gen workflow on a schedule defined in .env.
 * Defaults to 7:00 AM Eastern every day.
 *
 * Cron format: minute hour day-of-month month day-of-week
 * Example:  "0 7 * * *"  →  7:00 AM every day
 */

const cron = require('node-cron');
const { runWorkflow } = require('./workflow');
const logger = require('./logger');

function startScheduler() {
  const schedule = process.env.CRON_SCHEDULE || '0 7 * * *';
  const timezone = process.env.CRON_TIMEZONE || 'America/New_York';
  const maxLeads = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

  if (!cron.validate(schedule)) {
    throw new Error(`Invalid CRON_SCHEDULE: "${schedule}"`);
  }

  logger.info(`Scheduler started — cron: "${schedule}" (${timezone}), max ${maxLeads} leads/run`);

  const task = cron.schedule(
    schedule,
    async () => {
      logger.info('Cron triggered — starting scheduled run');
      try {
        await runWorkflow(maxLeads);
      } catch (err) {
        // Belt-and-suspenders: workflow catches its own errors, but
        // this prevents an uncaught exception from killing the process.
        logger.error('Unexpected error in scheduled run', err);
      }
    },
    {
      scheduled: true,
      timezone,
    }
  );

  // Print the next scheduled fire time so the user can confirm it
  logger.info(`Next run scheduled. Waiting for cron tick...`);
  return task;
}

module.exports = { startScheduler };
