/**
 * index.js — Entry point.
 *
 * Validates environment, then registers the cron job that fires
 * runWorkflow() every morning at 7:00 AM Eastern Time.
 *
 * Run: npm start
 */

require('dotenv').config();

const cron     = require('node-cron');
const logger   = require('./logger');
const { runWorkflow } = require('./workflow');

// ── Startup validation ────────────────────────────────────────────────────────
const REQUIRED_ENV = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);

if (missing.length) {
  console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example → .env and fill in the values, then restart.');
  process.exit(1);
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
//
// Default cron expression: "0 7 * * *"  →  7:00 AM every day.
// node-cron v3 accepts a `timezone` option so DST is handled automatically.
// Override via CRON_SCHEDULE in .env if you want a different time.
//
const cronExpression = process.env.CRON_SCHEDULE || '0 7 * * *';

if (!cron.validate(cronExpression)) {
  console.error(`[FATAL] Invalid CRON_SCHEDULE: "${cronExpression}"`);
  process.exit(1);
}

cron.schedule(cronExpression, async () => {
  logger.info('Cron triggered — starting workflow run...');
  await runWorkflow();
}, {
  timezone: 'America/New_York', // Handles EST/EDT automatically.
});

logger.info('Lead generation scheduler is running.');
logger.info(`Schedule: "${cronExpression}" (America/New_York — 7:00 AM ET daily).`);
logger.info('To run immediately without waiting: npm run run-now');
logger.info('Press Ctrl+C to stop.');
