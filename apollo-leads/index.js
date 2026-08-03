/**
 * Scheduler entry point.
 * Runs the lead generation workflow on a cron schedule (default: 7am ET daily).
 *
 * Start with:   node index.js
 * Or via npm:   npm start
 *
 * The process stays alive and fires the workflow on schedule.
 * Use a process manager like PM2 for production:
 *   pm2 start index.js --name "hvac-leads" --cron-restart "0 7 * * *"
 */

require('dotenv').config();

const cron    = require('node-cron');
const { runWorkflow } = require('./src/workflow');
const logger  = require('./src/logger');

// Cron schedule from env, default = 7:00 AM daily.
// TZ=America/New_York in .env makes this fire at 7am Eastern regardless of DST.
const SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';

logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
logger.info('  HVAC Lead Gen — Southwest Michigan');
logger.info(`  Schedule: ${SCHEDULE} (TZ=${process.env.TZ || 'system'})`);
logger.info('  Run "node setup.js" first to verify connections.');
logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Validate the cron expression before starting
if (!cron.validate(SCHEDULE)) {
  logger.error(`Invalid CRON_SCHEDULE: "${SCHEDULE}". Example: "0 7 * * *"`);
  process.exit(1);
}

// Schedule the job
const job = cron.schedule(SCHEDULE, async () => {
  logger.info(`Cron fired: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  try {
    await runWorkflow();
  } catch (err) {
    logger.error(`Workflow error: ${err.message}`);
  }
}, {
  scheduled: true,
  timezone: process.env.TZ || 'America/New_York',
});

logger.info('Scheduler started. Waiting for next scheduled run...');
logger.info('(Press Ctrl+C to stop)');

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down scheduler...');
  job.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  job.stop();
  process.exit(0);
});
