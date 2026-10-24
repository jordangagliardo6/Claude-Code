/**
 * scheduler.js
 * Entry point for the scheduled workflow.
 * Runs the lead generation workflow every morning at 7:00 AM Eastern Time.
 *
 * Start with: node scheduler.js
 * The process must stay running (e.g., via PM2, a systemd service, or a VPS).
 */

require('dotenv').config();
const cron = require('node-cron');
const { run } = require('./workflow');
const config = require('./config');

// Cron expression: "0 7 * * *" = every day at 7:00 AM
const SCHEDULE = '0 7 * * *';

console.log('========================================');
console.log('  HVAC Lead Gen Scheduler');
console.log('========================================');
console.log(`  Schedule  : ${SCHEDULE} (7:00 AM daily)`);
console.log(`  Timezone  : ${config.SCHEDULER_TIMEZONE}`);
console.log(`  Max leads : ${config.MAX_LEADS_PER_RUN} per run`);
console.log(`  Sheet ID  : ${config.GOOGLE_SHEET_ID || '(not set)'}`);
console.log('----------------------------------------');
console.log('  Scheduler is running. Press Ctrl+C to stop.');
console.log('  To run immediately: node workflow.js');
console.log('  To test connections: node setup-test.js');
console.log('========================================\n');

if (!config.APOLLO_API_KEY) {
  console.error('ERROR: APOLLO_API_KEY is not set in your .env file. Exiting.');
  process.exit(1);
}
if (!config.GOOGLE_SHEET_ID) {
  console.error('ERROR: GOOGLE_SHEET_ID is not set in your .env file. Exiting.');
  process.exit(1);
}

// Schedule the job
cron.schedule(SCHEDULE, async () => {
  try {
    await run();
  } catch (err) {
    console.error('Unhandled error in scheduled run:', err);
  }
}, {
  scheduled: true,
  timezone: config.SCHEDULER_TIMEZONE,
});

// Keep the process alive
process.on('SIGINT', () => {
  console.log('\nScheduler stopped.');
  process.exit(0);
});
