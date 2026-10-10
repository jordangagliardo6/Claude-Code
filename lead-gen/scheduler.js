/**
 * Scheduler — runs the lead gen job at 7 AM Eastern every morning.
 *
 * Start with:  node scheduler.js
 * Keep alive:  use PM2, systemd, or a Docker container so it survives reboots.
 *
 * To change the schedule, edit the cron expression below.
 * node-cron format: second(opt) minute hour day-of-month month day-of-week
 */

require('dotenv').config();

const cron = require('node-cron');
const { runLeadGen } = require('./index');

// 7:00 AM Eastern — cron runs in server local time.
// If your server is UTC, set TZ=America/New_York in your environment,
// or adjust the hour to match UTC offset (UTC-5 winter → 12, UTC-4 summer → 11).
const CRON_SCHEDULE = '0 7 * * *';

console.log(`[scheduler] HVAC lead gen scheduler started`);
console.log(`[scheduler] Schedule: ${CRON_SCHEDULE} (7 AM server local time)`);
console.log(`[scheduler] Set TZ=America/New_York in your environment for Eastern time\n`);

// Validate cron expression before starting
if (!cron.validate(CRON_SCHEDULE)) {
  console.error('[scheduler] Invalid cron expression:', CRON_SCHEDULE);
  process.exit(1);
}

cron.schedule(CRON_SCHEDULE, async () => {
  console.log(`[scheduler] Firing scheduled job at ${new Date().toISOString()}`);
  try {
    const result = await runLeadGen();
    if (result.success) {
      console.log(`[scheduler] Job completed — ${result.added} leads added`);
    } else {
      console.error('[scheduler] Job failed:', result.error);
    }
  } catch (err) {
    console.error('[scheduler] Unexpected error:', err.message);
  }
}, {
  timezone: 'America/New_York', // node-cron supports IANA timezone strings
});

console.log('[scheduler] Waiting for next 7 AM Eastern trigger…');
