/**
 * HVAC Lead Generator — Cron Scheduler
 *
 * Starts the cron job and keeps the process alive.
 * Run with: node index.js
 *
 * To run a one-off pull without waiting for the schedule: node run-now.js
 */

require('dotenv').config();
const cron = require('node-cron');
const config = require('./config');
const { run } = require('./lib/runner');

console.log(`HVAC Lead Generator starting...`);
console.log(`Schedule: ${config.cron.schedule} (${config.cron.timezone})`);
console.log(`Max leads per run: ${config.apollo.maxLeadsPerRun}`);
console.log(`Sheet ID: ${config.sheets.spreadsheetId || '(not set)'}\n`);

if (!config.apollo.apiKey) {
  console.error('ERROR: APOLLO_API_KEY is not set. Please check your .env file.');
  process.exit(1);
}

if (!config.sheets.spreadsheetId) {
  console.error('ERROR: GOOGLE_SHEET_ID is not set. Please check your .env file.');
  process.exit(1);
}

// Schedule: 7:00 AM Eastern every day
cron.schedule(config.cron.schedule, async () => {
  try {
    await run();
  } catch (err) {
    console.error('Unexpected error during scheduled run:', err);
  }
}, {
  timezone: config.cron.timezone,
});

console.log('Scheduler running. Waiting for next 7:00 AM Eastern trigger...');
console.log('(Use Ctrl+C to stop, or run "node run-now.js" to trigger immediately.)\n');
