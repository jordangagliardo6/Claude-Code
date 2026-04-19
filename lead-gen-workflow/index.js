require('dotenv').config();
const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');
const { log } = require('./src/logger');

// Default: 7:00 AM Eastern = 12:00 UTC (accounts for EST; use 11:00 UTC during EDT/summer)
// You can override this in .env with the CRON_SCHEDULE variable
// Cron format: minute hour day month weekday
const SCHEDULE = process.env.CRON_SCHEDULE || '0 12 * * *';

log.info(`Scheduler starting — cron: "${SCHEDULE}" (UTC)`);
log.info('Tip: 7 AM EST = "0 12 * * *" | 7 AM EDT (summer) = "0 11 * * *"');
log.info('Run `npm run test-connection` first to verify API access.');

cron.schedule(SCHEDULE, async () => {
  log.info('Cron triggered — starting scheduled run...');
  try {
    await runWorkflow();
  } catch (err) {
    log.error(`Unhandled error in scheduled run: ${err.message}`);
  }
}, {
  timezone: 'America/New_York', // node-cron respects this for the schedule interpretation
});

log.info(`Scheduler is running. Next run at: ${getNextRunDescription(SCHEDULE)}`);
log.info('Press Ctrl+C to stop.');

function getNextRunDescription(schedule) {
  try {
    // node-cron doesn't expose next-run natively, so we just show the pattern
    const parts = schedule.split(' ');
    if (parts.length === 5) {
      const [min, hour] = parts;
      return `every day at ${hour.padStart(2, '0')}:${min.padStart(2, '0')} (America/New_York)`;
    }
  } catch (_) {}
  return `schedule: ${schedule}`;
}
