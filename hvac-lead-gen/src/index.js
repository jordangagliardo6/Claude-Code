// Scheduler entry point — keeps the process alive and fires the workflow
// every morning at 7:00 AM Eastern Time.
require('dotenv').config();
const cron = require('node-cron');
const logger = require('./logger');
const { runWorkflow } = require('./workflow');

// ─── Schedule ─────────────────────────────────────────────────────────────────
// Cron: "0 7 * * *" = every day at 7:00 AM
// The `timezone` option in cron.schedule() handles EST/EDT automatically, so
// you never need to adjust for daylight saving time.
const CRON_SCHEDULE = '0 7 * * *';
const TIMEZONE = 'America/New_York';

// ─── Startup message ──────────────────────────────────────────────────────────
logger.info('HVAC Lead Generation Scheduler started');
logger.info(`Cron: "${CRON_SCHEDULE}" in timezone ${TIMEZONE}`);
logger.info(`Next run: ${nextRunTime()}`);
logger.info('Run once immediately with:  npm run run-now');
logger.info('Stop scheduler with:        Ctrl+C');

// ─── Register cron job ────────────────────────────────────────────────────────
cron.schedule(
  CRON_SCHEDULE,
  async () => {
    logger.info('Scheduled trigger fired');
    try {
      await runWorkflow();
    } catch (err) {
      // Catch anything the workflow itself didn't handle so the scheduler
      // process doesn't crash and stop future runs.
      logger.error('Unexpected scheduler error', { error: err.message, stack: err.stack });
    }
  },
  { timezone: TIMEZONE }
);

// ─── Helper ───────────────────────────────────────────────────────────────────
function nextRunTime() {
  const now = new Date();
  const next = new Date();
  // Set to 7:00 AM ET today
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
  next.setHours(etNow.getHours(), etNow.getMinutes(), etNow.getSeconds(), 0);
  next.setHours(7, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toLocaleString('en-US', { timeZone: TIMEZONE, hour12: true });
}
