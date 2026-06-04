require('dotenv').config();

const cron   = require('node-cron');
const { runWorkflow } = require('./src/workflow');
const logger = require('./src/logger');

// ── Schedule configuration ──
// CRON_SCHEDULE defaults to 7:00 AM — change in .env to adjust time
const SCHEDULE = process.env.CRON_SCHEDULE ?? '0 7 * * *';
const TIMEZONE = 'America/New_York';

logger.info(`Scheduler starting — cron "${SCHEDULE}" in ${TIMEZONE}`);
logger.info('Press Ctrl+C to stop. Pass --run-now to also execute immediately.');

// Register the daily job
cron.schedule(
  SCHEDULE,
  async () => {
    logger.info('Cron triggered — running workflow');
    try {
      await runWorkflow();
    } catch (err) {
      logger.error(`Unhandled scheduler error: ${err.message}`, { stack: err.stack });
    }
  },
  { timezone: TIMEZONE }
);

// --run-now flag: execute one immediate run on top of the scheduled ones
if (process.argv.includes('--run-now')) {
  logger.info('--run-now detected — executing workflow immediately');
  runWorkflow().catch(err => {
    logger.error(`Immediate run failed: ${err.message}`);
    process.exit(1);
  });
}
