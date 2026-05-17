/**
 * Scheduler entry point
 *
 * Starts a cron job that runs the lead generation workflow every morning.
 * Default: 7:00 AM Eastern Time (12:00 UTC in winter / 11:00 UTC in summer).
 * Override with the CRON_SCHEDULE env var.
 *
 * Run this process with: node src/scheduler.js
 * Keep it alive with PM2, systemd, or a cloud runner.
 */

require('dotenv').config();
const cron = require('node-cron');
const { run } = require('./workflow');
const log = require('./logger');

// Default is 7 AM Eastern (UTC offset varies with DST)
// Winter (EST, UTC-5): 0 12 * * *
// Summer (EDT, UTC-4): 0 11 * * *
// Easiest: set CRON_SCHEDULE in .env and update it at each DST transition,
// or use a timezone-aware scheduler (see note below).
const SCHEDULE = process.env.CRON_SCHEDULE || '0 12 * * *';

// node-cron supports timezone directly — this is the preferred approach
const JOB = cron.schedule(
  SCHEDULE,
  async () => {
    log.info(`Cron triggered at ${new Date().toISOString()}`);
    try {
      await run();
    } catch (err) {
      log.error(`Scheduler caught unhandled error: ${err.message}`);
    }
  },
  {
    scheduled: true,
    timezone: 'America/New_York', // Automatically handles EST/EDT — no manual DST adjustment needed
  }
);

log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
log.info('HVAC Lead Gen Scheduler is running');
log.info(`Schedule : ${SCHEDULE} (America/New_York)`);
log.info(`Next run : See cron expression above — first fire at 7:00 AM ET`);
log.info('To run immediately without waiting: node src/workflow.js');
log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Graceful shutdown
process.on('SIGTERM', () => { JOB.stop(); log.info('Scheduler stopped (SIGTERM).'); });
process.on('SIGINT',  () => { JOB.stop(); log.info('Scheduler stopped (SIGINT).'); process.exit(0); });
