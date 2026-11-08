/**
 * HVAC Lead Scraper — entry point.
 *
 * Scheduled to run every day at 7:00 AM Eastern Time.
 * Pulls up to MAX_LEADS_PER_RUN (default 25) new HVAC leads from Apollo.io
 * and appends them to your Google Sheet.
 *
 * Usage:
 *   npm start              — start the scheduler (runs at 7am ET daily)
 *   npm run run-now        — run once immediately (good for testing)
 *   npm run test-connection — verify Apollo + Google Sheets before first run
 */

require('dotenv').config();
const cron = require('node-cron');
const { runLeadScraper } = require('./lib/scraper');

// Fail fast if the two required env vars are missing
const required = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`\nMissing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env, fill in the values, then restart.\n');
  process.exit(1);
}

// Schedule: 7:00 AM every day, America/New_York (handles EST/EDT automatically)
cron.schedule(
  '0 7 * * *',
  async () => {
    console.log('Cron triggered — 7:00 AM Eastern');
    await runLeadScraper();
  },
  { timezone: 'America/New_York' }
);

console.log('HVAC Lead Scraper started.');
console.log('Scheduled for 7:00 AM Eastern Time, every day.');
console.log('\nRun "npm run test-connection" to verify API connections.');
console.log('Run "npm run run-now" to execute a scrape immediately.');

// --now flag: run immediately (useful for first-time testing)
if (process.argv.includes('--now')) {
  console.log('\n--now flag detected, running immediately...\n');
  runLeadScraper();
}
