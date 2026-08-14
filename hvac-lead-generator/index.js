require('dotenv').config();
const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');
const config = require('./src/config');

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`;

console.log('═══════════════════════════════════════════════════════');
console.log('  HVAC Lead Generator');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Schedule  : 7:00 AM Eastern (${config.cronSchedule} with TZ=America/New_York)`);
console.log(`  Max leads : ${config.apollo.maxLeadsPerRun} per run`);
console.log(`  Sheet     : ${SHEET_URL}`);
console.log('───────────────────────────────────────────────────────');
console.log('  Run "npm run setup"   to test connections');
console.log('  Run "npm run run-now" to pull leads immediately');
console.log('═══════════════════════════════════════════════════════\n');

// Verify required env vars before registering the cron job
const missing = [];
if (!process.env.APOLLO_API_KEY) missing.push('APOLLO_API_KEY');
if (!process.env.GOOGLE_CREDENTIALS_JSON && !process.env.GOOGLE_CREDENTIALS_FILE) {
  missing.push('GOOGLE_CREDENTIALS_JSON (or GOOGLE_CREDENTIALS_FILE)');
}
if (missing.length) {
  console.error('❌ Missing required environment variables:');
  missing.forEach(v => console.error(`   - ${v}`));
  console.error('\nCreate a .env file from .env.example and fill in the values, then restart.');
  process.exit(1);
}

// Register the daily cron job.
// node-cron picks up TZ from the process environment variable set in .env.
cron.schedule(config.cronSchedule, async () => {
  try {
    await runWorkflow();
  } catch (err) {
    console.error('Unexpected error during scheduled run:', err);
  }
}, {
  timezone: 'America/New_York',
});

console.log('Scheduler running. Waiting for 7:00 AM Eastern...');
console.log('Press Ctrl+C to stop.\n');
