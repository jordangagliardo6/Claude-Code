/**
 * Cron scheduler for HVAC Lead Generator
 * Runs the lead pull every morning at 7:00 AM Eastern Time.
 *
 * Start with: node cron-job.js
 * Keep running in the background with: nohup node cron-job.js &
 * Or use PM2:  pm2 start cron-job.js --name hvac-leads
 */

require('dotenv').config();
const cron = require('node-cron');
const { run } = require('./index');

// 7:00 AM Eastern — node-cron uses local server time by default.
// If your server is set to UTC, use '0 12 * * *' (UTC 12:00 = 7:00 AM ET).
// If your server is in Eastern Time, use '0 7 * * *' directly.
//
// We pass the timezone explicitly so it works regardless of server locale.
const CRON_SCHEDULE = '0 7 * * *'; // Every day at 7:00 AM
const TIMEZONE = 'America/New_York';

console.log('='.repeat(60));
console.log('HVAC Lead Generator — Scheduler Starting');
console.log(`Schedule: ${CRON_SCHEDULE} (${TIMEZONE})`);
console.log(`Next run: ${getNextRunTime()}`);
console.log('='.repeat(60));

// Schedule the job
const job = cron.schedule(
  CRON_SCHEDULE,
  async () => {
    console.log('\n[Cron] Scheduled run triggered at', new Date().toLocaleString('en-US', { timeZone: TIMEZONE }), 'ET');
    try {
      const result = await run();
      if (!result.success) {
        console.error('[Cron] Run completed with errors — check error.log');
      } else {
        console.log(`[Cron] Run completed successfully — ${result.appended} leads added`);
      }
    } catch (err) {
      console.error('[Cron] Unexpected error during scheduled run:', err);
    }
  },
  {
    timezone: TIMEZONE,
  }
);

// Keep the process alive and print a heartbeat every hour
setInterval(() => {
  console.log(`[Heartbeat] ${new Date().toLocaleString('en-US', { timeZone: TIMEZONE })} ET — scheduler running, next run: ${getNextRunTime()}`);
}, 60 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Cron] SIGTERM received — stopping scheduler');
  job.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[Cron] SIGINT received — stopping scheduler');
  job.stop();
  process.exit(0);
});

function getNextRunTime() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(7, 0, 0, 0);
  // If it's already past 7am today, schedule for tomorrow
  if (now >= next) {
    next.setDate(next.getDate() + 1);
  }
  return next.toLocaleString('en-US', { timeZone: TIMEZONE });
}
