require('dotenv').config();
const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');
const { validate } = require('./src/config');
const { config } = require('./src/config');
const logger = require('./src/logger');

// Validate required environment variables at startup
try {
  validate();
} catch (err) {
  console.error(`\n[STARTUP ERROR] ${err.message}\n`);
  console.error('Copy .env.example to .env and fill in your credentials.\n');
  process.exit(1);
}

logger.info('HVAC Lead Gen scheduler starting', {
  schedule: config.workflow.cronSchedule,
  maxLeadsPerRun: config.workflow.maxLeadsPerRun,
});

// Schedule the workflow
cron.schedule(config.workflow.cronSchedule, async () => {
  logger.info('Cron triggered — starting scheduled workflow run');
  try {
    await runWorkflow();
  } catch (err) {
    logger.error('Unhandled error in scheduled run', { error: err.message });
  }
}, {
  timezone: 'America/New_York', // 7am Eastern
});

logger.info('Scheduler is running. Next run: 7:00 AM Eastern Time.');
logger.info('To run immediately, use: npm run run-once');
logger.info('Press Ctrl+C to stop.\n');
