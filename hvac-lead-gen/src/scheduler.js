/**
 * Cron scheduler — runs the workflow on a configurable schedule.
 * Default: every day at 7:00am Eastern Time (12:00 UTC).
 *
 * To change the time, update CRON_SCHEDULE in your .env file.
 * node-cron format: second(opt) minute hour day month weekday
 * Examples:
 *   "0 12 * * *"  — 12:00 UTC daily (7am Eastern Standard / 8am Eastern Daylight)
 *   "0 11 * * *"  — 11:00 UTC daily (6am EST / 7am EDT) ← use this in summer
 *   "0 12 * * 1-5" — weekdays only
 */

const cron = require('node-cron');
const { runWorkflow } = require('./workflow');
const { log } = require('./notify');

function startScheduler() {
  const schedule = process.env.CRON_SCHEDULE || '0 12 * * *';

  if (!cron.validate(schedule)) {
    throw new Error(`Invalid CRON_SCHEDULE: "${schedule}"`);
  }

  log('info', `Scheduler started — runs on cron: "${schedule}" (UTC)`);
  log('info', 'Tip: "0 12 * * *" = 7am Eastern Standard / 8am Eastern Daylight');

  cron.schedule(schedule, async () => {
    log('info', 'Cron triggered — starting scheduled workflow run');
    await runWorkflow();
  });
}

module.exports = { startScheduler };
