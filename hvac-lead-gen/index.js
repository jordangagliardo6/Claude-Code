'use strict';

/**
 * Entry point — starts the node-cron scheduler.
 *
 * Usage:
 *   node index.js          ← runs the scheduler (stays alive 24/7)
 *   node src/workflow.js   ← fire one run immediately (no scheduler)
 *   node setup.js          ← test API connections before first scheduled run
 */

require('dotenv').config();
const cron   = require('node-cron');
const config = require('./src/config');
const logger = require('./src/logger');
const { run } = require('./src/workflow');

// Validate required env vars before starting
const required = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID'];
const missing  = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in your values, then re-run.');
  process.exit(1);
}

logger.info('HVAC Lead Gen scheduler starting…');
logger.info(`Schedule: "${config.cronSchedule}" (${config.timezone})`);
logger.info(`Max leads per run: ${config.maxLeadsPerRun}`);
logger.info('Cities: ' + config.TARGET_CITIES.join(', '));

if (!cron.validate(config.cronSchedule)) {
  console.error(`[FATAL] Invalid CRON_SCHEDULE: "${config.cronSchedule}"`);
  process.exit(1);
}

// Schedule the workflow
cron.schedule(
  config.cronSchedule,
  async () => {
    logger.info('Cron triggered — starting lead gen run…');
    await run();
  },
  { timezone: config.timezone }
);

logger.success(
  `Scheduler running. Next run at 7:00 AM ${config.timezone}. ` +
  `Keep this process alive (e.g. with PM2 or a systemd service). ` +
  `Press Ctrl+C to stop.`
);

// Optionally fire once immediately on startup (handy for first-time testing)
if (process.argv.includes('--run-now')) {
  logger.info('--run-now flag detected — executing one run immediately…');
  run();
}
