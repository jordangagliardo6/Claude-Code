/**
 * index.js — Scheduler entry point.
 *
 * Starts a node-cron job that runs the lead gen workflow every morning.
 * Schedule is defined in config.js (default: 7:00 AM Eastern).
 *
 * Run with:  node index.js   (keeps running, fires daily)
 * One-shot:  npm run run-now
 */

require('dotenv').config();
const cron = require('node-cron');
const config = require('./config');
const { runWorkflow } = require('./src/workflow');

console.log('HVAC Lead Gen scheduler starting…');
console.log(`Cron schedule: ${config.CRON_SCHEDULE} (America/New_York)`);
console.log('Next run: every day at 7:00 AM Eastern Time');
console.log('Press Ctrl+C to stop.\n');

if (!cron.validate(config.CRON_SCHEDULE)) {
  console.error(`Invalid cron schedule: "${config.CRON_SCHEDULE}"`);
  process.exit(1);
}

cron.schedule(config.CRON_SCHEDULE, async () => {
  try {
    await runWorkflow();
  } catch (err) {
    // sendAlert already called inside runWorkflow; just prevent crash
    console.error('Workflow failed (see alert above):', err.message);
  }
}, {
  timezone: 'America/New_York',
});

console.log('Scheduler is running. Waiting for next 7:00 AM Eastern…');
