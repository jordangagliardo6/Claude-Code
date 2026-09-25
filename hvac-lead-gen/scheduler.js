'use strict';
require('dotenv').config();

const cron = require('node-cron');
const { runJob } = require('./index');

// ── Schedule ─────────────────────────────────────────────────────────────────
// Runs every day at 7:00 AM Eastern Time (America/New_York handles EST/EDT automatically).
// Format: minute hour day-of-month month day-of-week
const SCHEDULE  = '0 7 * * *';
const TIMEZONE  = 'America/New_York';

console.log(`HVAC Lead Gen Scheduler started.`);
console.log(`Schedule : ${SCHEDULE} (${TIMEZONE})`);
console.log(`Runs at  : 7:00 AM Eastern Time, every day.`);
console.log(`Press Ctrl+C to stop.\n`);

cron.schedule(SCHEDULE, async () => {
  console.log(`[${new Date().toISOString()}] Cron triggered — starting scheduled run…`);
  try {
    await runJob();
  } catch (err) {
    // runJob() already logs details and sends an alert email; just prevent process crash
    console.error(`Scheduled run failed: ${err.message}`);
  }
}, { timezone: TIMEZONE });
