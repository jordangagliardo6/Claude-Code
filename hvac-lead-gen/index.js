/**
 * HVAC Lead Generation Scheduler
 *
 * Starts a cron job that fires every morning at 7am Eastern Time.
 * Default schedule: "0 11 * * *" (11:00 UTC = 7:00am EDT in summer)
 *
 * Usage:
 *   npm start               — start the scheduler (runs forever)
 *   npm run run-once        — execute one run right now
 *   npm run test-connection — verify API credentials before first run
 */

require('dotenv').config();

const cron = require('node-cron');
const { run } = require('./src/leadGenerator');
const logger = require('./src/logger');

// ─── Schedule ─────────────────────────────────────────────────────────────────
// Default: 0 11 * * * = 11:00 UTC = 7:00am EDT (UTC-4, summer)
// Change to "0 12 * * *" for Eastern Standard Time (UTC-5, winter)
// Or set CRON_SCHEDULE in .env to override without touching this file.
const schedule = process.env.CRON_SCHEDULE || '0 11 * * *';

if (!cron.validate(schedule)) {
  logger.error(`Invalid cron schedule: "${schedule}"`);
  process.exit(1);
}

logger.info(`HVAC Lead Gen scheduler starting — schedule: "${schedule}" (UTC)`);
logger.info(`Logs are written to: ${require('path').join(__dirname, 'logs')}`);

// Run once immediately on startup so you can confirm everything works
// without waiting until 7am. Comment this out if you don't want that.
logger.info('Running once on startup to verify connectivity...');
run()
  .then(({ fetched, added, skipped }) => {
    logger.success(`Startup run done — fetched: ${fetched}, added: ${added}, skipped: ${skipped}`);
    startScheduler();
  })
  .catch((err) => {
    logger.error('Startup run failed — scheduler will still start for the next scheduled run', err);
    startScheduler();
  });

function startScheduler() {
  const task = cron.schedule(schedule, async () => {
    logger.info('Scheduled run triggered by cron');
    try {
      const { fetched, added, skipped } = await run();
      logger.success(`Scheduled run done — fetched: ${fetched}, added: ${added}, skipped: ${skipped}`);
    } catch (err) {
      logger.error('Scheduled run failed (see alert email for details)', err);
    }
  }, {
    timezone: 'America/New_York', // node-cron honors the system TZ; this is belt-and-suspenders
  });

  logger.info('Scheduler active. Press Ctrl+C to stop.');

  process.on('SIGINT', () => {
    logger.info('Shutting down scheduler...');
    task.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received — shutting down scheduler...');
    task.stop();
    process.exit(0);
  });
}
