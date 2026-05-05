'use strict';

/**
 * Scheduler — registers the daily 7 am Eastern Time cron job.
 *
 * node-cron docs: https://www.npmjs.com/package/node-cron
 *
 * Cron expression:  0 7 * * *
 *   ┌── minute  (0)
 *   │ ┌── hour   (7 = 7 am)
 *   │ │ ┌── day of month (every day)
 *   │ │ │ ┌── month (every month)
 *   │ │ │ │ ┌── day of week (every weekday)
 *   0 7 * * *
 *
 * To change the schedule (e.g., weekdays only at 8 am):
 *   expression: '0 8 * * 1-5'
 *
 * To change the timezone, update the `timezone` option below.
 */

const cron = require('node-cron');
const workflow = require('./workflow');
const logger = require('./logger');

const CRON_EXPRESSION = process.env.CRON_SCHEDULE || '0 7 * * *';
const TIMEZONE = process.env.CRON_TIMEZONE || 'America/New_York';

/**
 * Start the scheduler.  Logs the next scheduled time and returns the cron task
 * so the caller can stop it with `task.stop()` if needed.
 *
 * @returns {cron.ScheduledTask}
 */
function start() {
  if (!cron.validate(CRON_EXPRESSION)) {
    throw new Error(`Invalid cron expression: "${CRON_EXPRESSION}"`);
  }

  logger.info(`Scheduler started — cron: "${CRON_EXPRESSION}" (${TIMEZONE})`);
  logger.info('Next run: every day at 7:00 AM Eastern Time.');
  logger.info('Keep this process running (e.g., via pm2 or a system service).');

  const task = cron.schedule(
    CRON_EXPRESSION,
    async () => {
      logger.info('Cron fired — starting lead-gen run…');
      try {
        const summary = await workflow.run();
        logger.info(`Scheduled run finished. Added: ${summary.added}, Error: ${summary.error ?? 'none'}`);
      } catch (err) {
        // workflow.run() should catch its own errors, but belt-and-suspenders here.
        logger.error(`Unexpected scheduler-level error: ${err.message}`);
      }
    },
    {
      scheduled: true,
      timezone: TIMEZONE,
    }
  );

  return task;
}

module.exports = { start };
