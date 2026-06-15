/**
 * index.js — Scheduler entry point
 *
 * Runs the lead generation workflow every morning at 7:00 AM Eastern Time.
 * Uses node-cron under the hood — no external cron daemon needed.
 *
 * Start with: npm start
 * Keep running in the background with: pm2 start index.js --name lead-gen
 *   (install pm2 globally: npm install -g pm2)
 */

'use strict';

require('dotenv').config();

const cron = require('node-cron');
const { run } = require('./workflow');

// ─── Cron schedule: 7:00 AM Eastern Time, every day ──────────────────────────
// Cron format: second(opt) minute hour day-of-month month day-of-week
const SCHEDULE = '0 7 * * *';
const TIMEZONE = 'America/New_York';

console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║       HVAC Lead Generation — Scheduler Starting           ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`Schedule  : ${SCHEDULE} (${TIMEZONE})`);
console.log(`Runs at   : 7:00 AM ET every morning`);
console.log(`Max leads : ${process.env.MAX_LEADS_PER_RUN || 25} per run`);
console.log('');
console.log('The scheduler is active. Leave this process running.');
console.log('To run once immediately, press Ctrl+C and run: node workflow.js');
console.log('');

// Validate required environment variables before scheduling
const requiredEnv = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
const missing = requiredEnv.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  console.error('   Copy .env.example to .env and fill in your values.');
  process.exit(1);
}

// Schedule the job
cron.schedule(SCHEDULE, async () => {
  console.log(`\n[${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET] Scheduled run starting…`);
  try {
    await run();
  } catch (err) {
    // Errors inside run() are already handled; this catches any unexpected throws
    console.error('Unexpected top-level error:', err.message);
  }
}, {
  timezone: TIMEZONE,
});
