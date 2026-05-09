/**
 * HVAC Lead Generator — Main Entry Point
 *
 * Modes:
 *   npm start              → start the scheduler (runs daily at 7 AM Eastern)
 *   npm run run-now        → execute one run immediately, then exit
 *   npm run test-connection → verify Apollo + Google Sheets before first run
 */

require('dotenv').config();
const cron     = require('node-cron');
const { runLeadGenerationWorkflow } = require('./src/workflow');
const logger   = require('./src/logger');

// ─── Immediate run mode ───────────────────────────────────────────────────────
if (process.argv.includes('--run-now')) {
  logger.info('Manual run requested (--run-now)');

  runLeadGenerationWorkflow()
    .then(result => {
      if (result.success) {
        logger.success('Manual run complete', result);
        process.exit(0);
      } else {
        logger.error('Manual run failed', result);
        process.exit(1);
      }
    })
    .catch(err => {
      logger.error('Unexpected error', { error: err.message, stack: err.stack });
      process.exit(1);
    });

  return; // stop here — don't set up the scheduler
}

// ─── Scheduled run mode ───────────────────────────────────────────────────────
//
// Default: "0 7 * * *" = 7:00 AM every day, America/New_York timezone.
// Override with the CRON_SCHEDULE env var if you need a different time.
//
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';

if (!cron.validate(CRON_SCHEDULE)) {
  logger.error(`Invalid cron expression in CRON_SCHEDULE: "${CRON_SCHEDULE}"`);
  process.exit(1);
}

logger.info('HVAC Lead Generator scheduler started');
logger.info(`Schedule: "${CRON_SCHEDULE}" (America/New_York)`);
logger.info(`Next run: ${getNextRunDisplay()}`);
logger.info('To run immediately: npm run run-now');
logger.info('Press Ctrl+C to stop the scheduler.');

cron.schedule(
  CRON_SCHEDULE,
  async () => {
    logger.info('Scheduled run triggered');
    try {
      const result = await runLeadGenerationWorkflow();
      if (result.success) {
        logger.success('Scheduled run complete', result);
      } else {
        logger.error('Scheduled run failed', result);
      }
    } catch (err) {
      logger.error('Unexpected error during scheduled run', { error: err.message });
    }
  },
  {
    scheduled: true,
    timezone: 'America/New_York',
  }
);

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGINT',  () => { logger.info('Scheduler stopped (SIGINT).');  process.exit(0); });
process.on('SIGTERM', () => { logger.info('Scheduler stopped (SIGTERM).'); process.exit(0); });

// ─── Helper ───────────────────────────────────────────────────────────────────
function getNextRunDisplay() {
  const now  = new Date();
  const next = new Date();
  next.setHours(7, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' Eastern';
}
