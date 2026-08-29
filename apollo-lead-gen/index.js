/**
 * index.js — Entry point for the scheduled lead generation workflow.
 *
 * Starts a node-cron job that runs the workflow automatically every morning
 * at 7:00 AM Eastern Time. Run with:
 *
 *   node index.js
 *
 * The process stays alive and the cron fires on schedule. To run once
 * immediately (e.g. for testing), use:
 *
 *   node run-now.js
 */

require('dotenv').config();

const cron = require('node-cron');
const log = require('./logger');
const config = require('./config');
const { runLeadWorkflow } = require('./run-leads');

// Validate required env vars before starting the scheduler.
const REQUIRED_ENV = ['APOLLO_API_KEY', 'GOOGLE_SERVICE_ACCOUNT_KEY_FILE', 'GOOGLE_SHEET_ID'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`\n[startup] Missing required environment variables: ${missing.join(', ')}`);
  console.error('[startup] Copy .env.example to .env and fill in the values.\n');
  process.exit(1);
}

log.info('Apollo Lead Gen scheduler starting…');
log.info(`Schedule: "${config.CRON_SCHEDULE}" (America/New_York)`);
log.info(`Spreadsheet: ${process.env.GOOGLE_SHEET_ID}`);
log.info('Waiting for next scheduled run. Press Ctrl+C to stop.');

// Schedule the workflow — runs at 7:00 AM Eastern every day.
cron.schedule(
  config.CRON_SCHEDULE,
  async () => {
    const result = await runLeadWorkflow();

    if (result.error) {
      log.error('Scheduled run', result.error);
    } else {
      log.info(`Scheduled run done — ${result.added}/${result.fetched} leads added.`);
    }
  },
  {
    timezone: 'America/New_York',
  }
);
