'use strict';

/**
 * Scheduler — runs the lead generator every day at 7:00 AM Eastern Time.
 *
 * Start with:   node scheduler.js
 * Keep alive:   pm2 start scheduler.js --name hvac-leads   (recommended)
 *
 * The process must stay running for the cron to fire. Use pm2, systemd,
 * or a similar process manager so it restarts automatically on reboots.
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const cron     = require('node-cron');
const { run }  = require('./src/leadGenerator');
const notifier = require('./src/notifier');

// ─────────────────────────────────────────────────────────────────────────────
// Schedule: 7:00 AM Eastern every day
//   Cron format:  minute  hour  day  month  weekday
//   "0 7 * * *"  = top of the 7th hour, every day
//   timezone     = America/New_York handles EST/EDT automatically
// ─────────────────────────────────────────────────────────────────────────────
const CRON_EXPRESSION = '0 7 * * *';
const TIMEZONE        = 'America/New_York';

console.log(`HVAC Lead Gen scheduler started.`);
console.log(`Next run: every day at 7:00 AM Eastern (${TIMEZONE})`);
console.log(`Process PID: ${process.pid}`);

cron.schedule(
  CRON_EXPRESSION,
  async () => {
    try {
      await run();
    } catch (err) {
      await notifier.notifyError('Scheduled run failed', err.stack || err.message);
    }
  },
  { timezone: TIMEZONE }
);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nScheduler shutting down (SIGTERM).');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nScheduler shutting down (SIGINT / Ctrl+C).');
  process.exit(0);
});
