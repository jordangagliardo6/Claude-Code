'use strict';

/**
 * Entry point. Starts the cron scheduler and fires the workflow every morning
 * at 7:00 AM Eastern Time (handles EST/EDT automatically via timezone option).
 *
 * Run: npm start
 * Requires: .env file configured, Google credentials in place.
 */

require('dotenv').config();
const cron = require('node-cron');
const { runLeadGeneration } = require('./workflow');
const { logInfo, logError } = require('./notify');

const CRON_SCHEDULE = '0 7 * * *'; // 7:00 AM daily
const TIMEZONE = 'America/New_York';

logInfo('HVAC Lead Generation scheduler starting...');
logInfo(`Schedule: ${CRON_SCHEDULE} (${TIMEZONE}) — runs every day at 7:00 AM ET`);

// Validate cron expression before registering
if (!cron.validate(CRON_SCHEDULE)) {
  console.error(`Invalid cron expression: ${CRON_SCHEDULE}`);
  process.exit(1);
}

cron.schedule(
  CRON_SCHEDULE,
  async () => {
    logInfo('Scheduled run triggered.');
    try {
      await runLeadGeneration();
    } catch (err) {
      logError('Unhandled error in scheduled run', err);
    }
  },
  { timezone: TIMEZONE }
);

logInfo('Scheduler is running. Waiting for next 7:00 AM ET trigger...');
logInfo('Tip: run `npm run run-now` in a separate terminal to test immediately.');

// Keep the process alive
process.on('SIGINT', () => {
  logInfo('Scheduler stopped by user.');
  process.exit(0);
});
