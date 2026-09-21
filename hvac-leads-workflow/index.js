/**
 * HVAC Lead Generation Scheduler
 *
 * Runs every morning at 7am Eastern (configurable via CRON_SCHEDULE in .env).
 * Pulls up to MAX_LEADS_PER_RUN new HVAC leads from Apollo.io and appends
 * them to the configured Google Sheet, skipping any already in the sheet.
 *
 * Usage:
 *   node index.js          — starts the scheduler (keeps running)
 *   node run-once.js       — runs one pull cycle immediately and exits
 *   node test-connection.js — verifies API connections without writing data
 */

require('dotenv').config();

const cron = require('node-cron');
const { runLeadGeneration } = require('./run-leads');
const { alertError, log } = require('./logger');
const config = require('./config');

// Validate required config on startup
function validateConfig() {
  const errors = [];
  if (!config.apollo.apiKey) errors.push('APOLLO_API_KEY is missing from .env');
  if (!config.google.spreadsheetId) errors.push('SPREADSHEET_ID is missing from .env');
  if (errors.length) {
    console.error('\n[CONFIG ERROR] Missing required environment variables:');
    errors.forEach(e => console.error('  - ' + e));
    console.error('\nCopy .env.example to .env and fill in the values.\n');
    process.exit(1);
  }
}

validateConfig();

log(`Scheduler starting — will run at: "${config.scheduler.cronSchedule}" (${config.scheduler.timezone})`);
log(`Spreadsheet ID: ${config.google.spreadsheetId}`);
log(`Max leads per run: ${config.apollo.maxLeadsPerRun}`);

cron.schedule(
  config.scheduler.cronSchedule,
  async () => {
    try {
      await runLeadGeneration();
    } catch (err) {
      await alertError(
        `Lead generation run failed — ${new Date().toDateString()}`,
        `Error details:\n${err.message}\n\nStack:\n${err.stack}\n\n` +
        `Please check your Apollo API key, Google credentials, and spreadsheet permissions.`
      );
    }
  },
  { timezone: config.scheduler.timezone }
);

log('Scheduler is running. Press Ctrl+C to stop.');
log('To run a one-off pull right now, use: node run-once.js');
