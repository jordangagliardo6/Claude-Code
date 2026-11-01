/**
 * HVAC Lead Generation Scheduler
 *
 * Runs the lead-gen workflow automatically every morning at 7:00 AM Eastern Time.
 * Start with:  node index.js
 * One-off run: node src/run.js
 */

require('dotenv').config();
const cron = require('node-cron');
const { run } = require('./src/run');

// "0 7 * * *" = 7:00 AM every day
// node-cron uses the server's local timezone; set TZ=America/New_York in .env
// or run with:  TZ=America/New_York node index.js
const SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';

console.log('HVAC Lead Gen Scheduler started.');
console.log(`Schedule: "${SCHEDULE}" (timezone: ${process.env.TZ || 'system default'})`);
console.log('Set TZ=America/New_York in your .env to lock to Eastern Time.\n');

cron.schedule(SCHEDULE, async () => {
  console.log(`[${new Date().toISOString()}] Cron triggered — starting run...`);
  try {
    await run();
  } catch (err) {
    console.error('Unexpected error during scheduled run:', err);
  }
}, {
  timezone: process.env.TZ || 'America/New_York',
});

console.log('Waiting for next scheduled run. Press Ctrl+C to stop.');
console.log('To run immediately without waiting, use:  node src/run.js\n');
