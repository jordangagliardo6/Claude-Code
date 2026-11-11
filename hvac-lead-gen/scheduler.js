/**
 * scheduler.js — Runs the HVAC lead workflow every day at 7:00 AM Eastern Time.
 *
 * Start with:
 *   node scheduler.js
 *
 * Keep this process running (use PM2, systemd, or screen for production):
 *   pm2 start scheduler.js --name hvac-lead-gen
 */
require('dotenv').config();
const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');

// 7:00 AM Eastern Time daily
// node-cron respects the timezone option so you do not need to convert to UTC
const CRON_SCHEDULE = '0 7 * * *';
const TIMEZONE = 'America/New_York';

console.log('[Scheduler] HVAC Lead Generator started.');
console.log(`[Scheduler] Will run every day at 7:00 AM Eastern (${TIMEZONE}).`);
console.log('[Scheduler] To run immediately without waiting, use: node index.js');

cron.schedule(
  CRON_SCHEDULE,
  async () => {
    console.log('\n[Scheduler] Triggered scheduled run...');
    try {
      await runWorkflow();
    } catch (err) {
      // Unexpected errors that weren't caught inside runWorkflow
      console.error('[Scheduler] Uncaught error during run:', err.message);
    }
  },
  {
    scheduled: true,
    timezone: TIMEZONE,
  }
);

// Keep the process alive and show a heartbeat every 24h
setInterval(() => {
  console.log(`[Scheduler] Still running. ${new Date().toLocaleString('en-US', { timeZone: TIMEZONE })} (Eastern)`);
}, 24 * 60 * 60 * 1000);
