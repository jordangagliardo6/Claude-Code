/**
 * index.js
 * Entry point — loads environment variables and starts the cron scheduler.
 *
 * Schedule: Every day at 7:00 AM Eastern Time.
 * node-cron runs in local system time, so we use the TZ env var to anchor
 * to America/New_York regardless of the server's locale.
 *
 * Usage:
 *   node src/index.js           # start the scheduler (runs indefinitely)
 *   node src/run-once.js        # run exactly once right now (useful for testing)
 *   node src/test-connection.js # verify API credentials before first run
 */

// Must be first — loads .env before any other module reads process.env
require('dotenv').config();

const cron = require('node-cron');
const { runWorkflow } = require('./workflow');
const { logger }      = require('./notifier');

// ---------------------------------------------------------------------------
// Validate required environment variables at startup
// ---------------------------------------------------------------------------

const REQUIRED_VARS = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];

const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(
    '\n[FATAL] Missing required environment variables:\n' +
    missing.map((v) => `  • ${v}`).join('\n') +
    '\n\nCopy .env.example to .env and fill in your credentials.\n'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Cron schedule
// ---------------------------------------------------------------------------

/**
 * CRON_SCHEDULE — "0 7 * * *" = every day at 07:00 (server local time).
 *
 * To change the time, edit this string:
 *   "0 8 * * *"  → 8:00 AM
 *   "30 6 * * *" → 6:30 AM
 *   "0 7 * * 1-5" → 7:00 AM weekdays only
 *
 * The TZ environment variable (set in .env) anchors the schedule to
 * America/New_York so it stays correct across Daylight Saving Time changes.
 */
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

logger.info('HVAC Lead Gen scheduler starting…');
logger.info(`Schedule  : "${CRON_SCHEDULE}" (TZ=${process.env.TZ || 'system default'})`);
logger.info(`Spreadsheet ID : ${process.env.GOOGLE_SPREADSHEET_ID}`);
logger.info(`Sheet tab      : ${process.env.GOOGLE_SHEET_NAME || 'Leads'}`);
logger.info(`Max leads/run  : ${process.env.MAX_LEADS_PER_RUN || 25}`);
logger.info('Waiting for next scheduled run — press Ctrl+C to stop.');

const job = cron.schedule(
  CRON_SCHEDULE,
  async () => {
    logger.info('Cron triggered — starting workflow…');
    try {
      await runWorkflow();
    } catch (unexpectedErr) {
      // Belt-and-suspenders: runWorkflow should catch everything internally,
      // but we catch here too so the scheduler never crashes.
      logger.error(`Unexpected error in runWorkflow: ${unexpectedErr.message}`);
    }
  },
  {
    scheduled: true,
    timezone: process.env.TZ || 'America/New_York',
  }
);

// Graceful shutdown
process.on('SIGINT',  () => { logger.info('Shutting down (SIGINT)…');  job.stop(); process.exit(0); });
process.on('SIGTERM', () => { logger.info('Shutting down (SIGTERM)…'); job.stop(); process.exit(0); });
