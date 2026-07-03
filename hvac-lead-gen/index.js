/**
 * index.js
 * Scheduler entry point — runs the HVAC lead generation job every day
 * at 7:00 AM Eastern Time using node-cron.
 *
 * Start with:  node index.js
 * Keep running with PM2:  pm2 start index.js --name hvac-lead-gen
 */

'use strict';

require('dotenv').config();

const cron        = require('node-cron');
const { runLeadGen } = require('./run-lead-gen');

// ── Cron schedule: 7:00 AM every day, Eastern Time ───────────────────────────
// Modify this string if you want a different schedule.
// Format: second(optional) minute hour day-of-month month day-of-week
const SCHEDULE    = '0 7 * * *';   // 7:00 AM
const TIMEZONE    = 'America/New_York';

// ── Startup banner ───────────────────────────────────────────────────────────
console.log('');
console.log('┌─────────────────────────────────────────────────┐');
console.log('│   HVAC Lead Gen — Scheduler Starting            │');
console.log('│   Schedule: 7:00 AM Eastern Time, daily         │');
console.log('│   To run immediately: node run-now.js           │');
console.log('└─────────────────────────────────────────────────┘');
console.log('');

validateConfig();

// ── Register the cron job ─────────────────────────────────────────────────────
const task = cron.schedule(
  SCHEDULE,
  async () => {
    console.log('[Scheduler] Cron triggered — starting lead gen run');
    try {
      await runLeadGen();
    } catch (err) {
      // runLeadGen handles its own error logging and email alerts.
      // This catch is a last-resort safety net so the process never crashes.
      console.error('[Scheduler] Unhandled error in runLeadGen:', err.message);
    }
  },
  {
    scheduled : true,
    timezone  : TIMEZONE,
  }
);

console.log(`[Scheduler] Job registered — next run at 7:00 AM ET`);
console.log('[Scheduler] Process is running. Press Ctrl+C to stop.\n');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Scheduler] Shutting down…');
  task.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  task.destroy();
  process.exit(0);
});

// ── Config validation ─────────────────────────────────────────────────────────

function validateConfig() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  const missing  = required.filter(k => !process.env[k]);

  if (missing.length > 0) {
    console.error('[Scheduler] Missing required environment variables:');
    missing.forEach(k => console.error(`   ✗  ${k}`));
    console.error('\nCopy .env.example to .env and fill in your values, then run: node setup-test.js');
    process.exit(1);
  }

  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './service-account.json';
  const fs = require('fs');
  const path = require('path');
  if (!fs.existsSync(path.resolve(keyFile))) {
    console.error(`[Scheduler] Google service account key file not found: ${keyFile}`);
    console.error('Run: node setup-test.js  for setup instructions');
    process.exit(1);
  }

  console.log('[Scheduler] Config OK');
}
