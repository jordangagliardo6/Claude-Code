/**
 * HVAC Lead Generation Workflow — Scheduled Runner
 *
 * Runs automatically every morning at 7:00 AM Eastern Time.
 * Searches Apollo.io for HVAC owner/decision-makers in Southwest Michigan
 * and appends up to 25 new leads per day to your Google Sheet.
 *
 * Usage:
 *   node workflow.js          # Start the scheduler (keeps running)
 *   node run-now.js           # Trigger one run immediately (no scheduler)
 *   node test-connection.js   # Verify Apollo + Sheets are connected before first run
 */

require('dotenv').config();
const cron = require('node-cron');
const { runWorkflow } = require('./run-workflow');
const { log } = require('./logger');

// ── Cron schedule ──────────────────────────────────────────────────────────
// "0 7 * * *" = 7:00 AM every day
// timezone: 'America/New_York' = Eastern Time (auto-adjusts for EST/EDT)
const SCHEDULE = '0 7 * * *';
const TIMEZONE = 'America/New_York';

log.info(`HVAC Lead Gen scheduler starting. Cron: "${SCHEDULE}" (${TIMEZONE})`);
log.info(`Spreadsheet: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SPREADSHEET_ID || '1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus'}/edit`);
log.info('Waiting for next 7 AM ET run... (use "node run-now.js" to run immediately)');

cron.schedule(
  SCHEDULE,
  async () => {
    log.info('Cron fired — starting scheduled run.');
    try {
      const result = await runWorkflow();
      if (result.error) {
        log.error(`Run finished with error: ${result.error}`);
      } else {
        log.success(`Run finished successfully. Added ${result.added} lead(s).`);
      }
    } catch (err) {
      log.error(`Unexpected error during workflow run: ${err.stack}`);
    }
  },
  { timezone: TIMEZONE }
);

// Keep the process alive
process.on('SIGINT', () => {
  log.info('Scheduler stopped by user (SIGINT).');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('Scheduler stopped (SIGTERM).');
  process.exit(0);
});
