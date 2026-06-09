require('dotenv').config();

const cron = require('node-cron');
const { runWorkflow } = require('./src/leadGenerator');
const logger = require('./src/logger');

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *'; // Default: 7:00 AM daily
const TIMEZONE = 'America/New_York'; // Eastern Time (handles EST/EDT automatically)

// --run-now flag: execute immediately without waiting for the cron trigger.
// Useful for first-time testing: node index.js --run-now
const runNow = process.argv.includes('--run-now');

async function main() {
  logger.info('HVAC Lead Gen scheduler starting...');
  logger.info(`Schedule: "${CRON_SCHEDULE}" in timezone ${TIMEZONE}`);

  if (runNow) {
    logger.info('--run-now flag detected — executing immediately.');
    await runWorkflow();
    process.exit(0);
    return;
  }

  if (!cron.validate(CRON_SCHEDULE)) {
    logger.error(`Invalid CRON_SCHEDULE: "${CRON_SCHEDULE}". Fix it in .env and restart.`);
    process.exit(1);
  }

  cron.schedule(CRON_SCHEDULE, async () => {
    logger.info('Cron triggered — starting lead generation run...');
    await runWorkflow();
  }, { timezone: TIMEZONE });

  logger.info(`Scheduler is running. Next run will fire at 7:00 AM Eastern.`);
  logger.info('Keep this process alive (e.g. pm2, screen, or a systemd service).');
  logger.info('Run "node index.js --run-now" to trigger immediately for testing.');
}

main().catch((err) => {
  logger.error(`Unhandled startup error: ${err.message}`);
  process.exit(1);
});
