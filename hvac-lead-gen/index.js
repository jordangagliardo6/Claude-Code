/**
 * HVAC Lead Generator — Entry Point
 *
 * Schedules a daily 7:00 AM Eastern Time run that:
 *   • Searches Apollo.io for HVAC decision-makers in Southwest Michigan
 *   • Filters to owner-operated companies (1–25 employees)
 *   • Fetches phone numbers via Apollo enrichment
 *   • Deduplicates against the Google Sheet and appends up to 25 new rows
 *
 * Usage:
 *   node index.js           — start the scheduler (runs at 7am ET daily)
 *   npm run run-now         — run the workflow immediately (TEST_RUN=true)
 *   npm run test-connection — verify Apollo + Google Sheets connectivity
 */

require('dotenv').config();

const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');

// Validate that the required env vars are present before scheduling
const required = ['APOLLO_API_KEY', 'GOOGLE_SERVICE_ACCOUNT_KEY_FILE', 'SPREADSHEET_ID'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in your credentials.');
  process.exit(1);
}

console.log('HVAC Lead Generator started.');
console.log(`Spreadsheet ID: ${process.env.SPREADSHEET_ID}`);
console.log('Scheduled: 7:00 AM Eastern Time, every day\n');

// Trigger an immediate run when TEST_RUN=true (e.g. npm run run-now)
if (process.env.TEST_RUN === 'true') {
  console.log('TEST_RUN=true — executing workflow now...\n');
  runWorkflow()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
} else {
  // '0 7 * * *' with timezone: 'America/New_York' = exactly 7:00 AM ET, DST-aware
  cron.schedule(
    '0 7 * * *',
    () => {
      console.log(`\n[${new Date().toISOString()}] Cron triggered`);
      runWorkflow().catch((err) => console.error('Unhandled workflow error:', err.message));
    },
    { timezone: 'America/New_York' }
  );

  console.log('Scheduler running. Keep this process alive (e.g. via pm2 or systemd).');
  console.log('Press Ctrl+C to stop.\n');
}
