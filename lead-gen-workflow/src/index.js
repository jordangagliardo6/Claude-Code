/**
 * index.js
 * Entry point. Loads environment variables, then either:
 *   a) Runs the workflow immediately if --run-now flag is passed, or
 *   b) Schedules the workflow to run on the cron expression in .env.
 *
 * Usage:
 *   node src/index.js              → scheduled mode (7am ET daily)
 *   node src/index.js --run-now   → run once right now (good for testing)
 */

require('dotenv').config();

const cron     = require('node-cron');
const logger   = require('./logger');
const { runWorkflow } = require('./workflow');

// Validate required environment variables before doing anything else.
function validateEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  const missing  = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`\n[FATAL] Missing required environment variables:\n  ${missing.join('\n  ')}`);
    console.error('\nCopy .env.example to .env and fill in the values, then try again.\n');
    process.exit(1);
  }
}

validateEnv();

const RUN_NOW       = process.argv.includes('--run-now');
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *'; // 7:00 AM every day

if (RUN_NOW) {
  // ── Immediate one-shot mode ──────────────────────────────────────────────
  logger.info('--run-now flag detected. Running workflow immediately...');
  runWorkflow().then((summary) => {
    if (summary.error) process.exit(1);
  });
} else {
  // ── Scheduled mode ───────────────────────────────────────────────────────
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`[FATAL] Invalid CRON_SCHEDULE: "${CRON_SCHEDULE}". Fix it in .env and restart.`);
    process.exit(1);
  }

  logger.info(`Scheduler started. Cron: "${CRON_SCHEDULE}" (default = 7:00 AM daily)`);
  logger.info('Make sure your server timezone is set to America/New_York, or adjust the hour in .env.');
  logger.info('Waiting for next scheduled run. Press Ctrl+C to stop.');

  cron.schedule(CRON_SCHEDULE, () => {
    logger.info('Cron trigger fired.');
    runWorkflow().catch((err) => logger.error('Unhandled error from runWorkflow', err));
  });
}
