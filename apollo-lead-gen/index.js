'use strict';

require('dotenv').config();
const cron = require('node-cron');
const { run } = require('./src/runner');
const log     = require('./src/logger');

// ── Determine run mode ────────────────────────────────────────────────────────
// Pass --run-now on the command line to execute once immediately (for testing).
const RUN_NOW = process.argv.includes('--run-now');

// Cron schedule: default 7:00 AM Eastern = 12:00 UTC (noon).
// Override with CRON_SCHEDULE env var. Uses node-cron 5-field format:
// minute hour day-of-month month day-of-week
// Eastern time offset is handled by setting TZ=America/New_York in the env.
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 12 * * *';

if (RUN_NOW) {
  // ── One-shot execution ─────────────────────────────────────────────────────
  log.info('--run-now flag detected — executing immediately');
  run()
    .then(result => {
      if (!result.success) process.exit(1);
    })
    .catch(err => {
      log.error('Unhandled error in run()', err);
      process.exit(1);
    });

} else {
  // ── Scheduled execution ───────────────────────────────────────────────────
  log.info(`Scheduler started — cron: "${CRON_SCHEDULE}" (TZ: ${process.env.TZ || 'UTC'})`);
  log.info('Waiting for next scheduled run. Use --run-now to trigger immediately.');

  if (!cron.validate(CRON_SCHEDULE)) {
    log.error(`Invalid CRON_SCHEDULE: "${CRON_SCHEDULE}"`);
    process.exit(1);
  }

  cron.schedule(CRON_SCHEDULE, () => {
    log.info('Cron triggered — starting lead gen run');
    run().catch(err => log.error('Unhandled error in scheduled run()', err));
  }, {
    // Schedule in Eastern time so 7am ET is always correct regardless of server clock
    timezone: 'America/New_York',
  });

  // Keep the process alive
  process.on('SIGTERM', () => { log.info('Received SIGTERM — shutting down'); process.exit(0); });
  process.on('SIGINT',  () => { log.info('Received SIGINT — shutting down');  process.exit(0); });
}
