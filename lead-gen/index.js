require('dotenv').config();

const cron = require('node-cron');
const config = require('./src/config');
const logger = require('./src/logger');
const { runWorkflow } = require('./src/workflow');

// Validate that required env vars are present before starting the scheduler
function validateEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SPREADSHEET_ID'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    logger.error('Copy .env.example to .env and fill in your credentials, then restart.');
    process.exit(1);
  }
}

async function handleWorkflowError(err) {
  logger.alert(
    `Workflow failed — ${err.message}. ` +
    `Review the logs in ./logs/errors.log. Alert email: ${config.alertEmail}`
  );
}

validateEnv();

logger.info('HVAC Lead Generation Scheduler starting...');
logger.info(`Schedule: ${config.scheduleTime} (${config.timezone})`);
logger.info(`Cities: ${config.cities.join(', ')}`);
logger.info(`Max leads per run: ${config.maxLeadsPerRun}`);
logger.info('Scheduler is running. Waiting for next 7:00 AM Eastern trigger...');
logger.info('(Run "npm run run-now" to trigger immediately without waiting)');

// Schedule the workflow using node-cron with timezone support
cron.schedule(config.scheduleTime, async () => {
  logger.info('Cron triggered — starting workflow...');
  try {
    await runWorkflow();
  } catch (err) {
    await handleWorkflowError(err);
  }
}, {
  timezone: config.timezone,
});

// Keep process alive
process.on('SIGINT', () => {
  logger.info('Scheduler stopped by user (SIGINT).');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Scheduler stopped (SIGTERM).');
  process.exit(0);
});
