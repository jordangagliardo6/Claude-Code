'use strict';

require('dotenv').config();
const cron = require('node-cron');
const { runLeadGen } = require('./src/workflow');
const { sendAlert } = require('./src/notify');

// Default: 7:00am Eastern = 12:00 UTC (accounts for EST; adjust to "0 11 * * *" for EDT)
// Override via CRON_SCHEDULE in your .env file
const SCHEDULE = process.env.CRON_SCHEDULE || '0 12 * * *';

console.log('═'.repeat(60));
console.log(' HVAC Lead Gen — Southwest Michigan');
console.log('═'.repeat(60));
console.log(`Scheduler started. Cron: "${SCHEDULE}"`);
console.log(`Next run: ${getNextRunDescription(SCHEDULE)}`);
console.log('Press Ctrl+C to stop.\n');

// Validate required env vars at startup so you know immediately if something is misconfigured
checkEnv();

cron.schedule(SCHEDULE, async () => {
  console.log(`\n[cron] Triggering scheduled run at ${new Date().toISOString()}`);
  try {
    await runLeadGen();
  } catch (err) {
    // runLeadGen() already called sendAlert() for known errors.
    // This catches unexpected failures.
    await sendAlert('Unexpected scheduler error', err.stack || err.message);
  }
}, {
  scheduled: true,
  timezone: 'America/New_York', // 7am Eastern
});

function checkEnv() {
  const required = [
    'APOLLO_API_KEY',
    'GOOGLE_SPREADSHEET_ID',
    'GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error('ERROR: Missing required environment variables:');
    missing.forEach(k => console.error(`  - ${k}`));
    console.error('\nCopy .env.example to .env and fill in the values, then restart.');
    process.exit(1);
  }
}

function getNextRunDescription(schedule) {
  try {
    // node-cron doesn't expose next-run time, so we give a human hint
    const parts = schedule.split(' ');
    if (parts.length === 5) {
      return `Daily at minute=${parts[0]} hour=${parts[1]} UTC`;
    }
    return schedule;
  } catch {
    return schedule;
  }
}
