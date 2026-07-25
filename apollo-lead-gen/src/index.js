'use strict';

/**
 * Entry point.
 *
 * Usage:
 *   node src/index.js            — Start the cron scheduler (7am ET daily)
 *   node src/index.js --once     — Run immediately once, then exit
 *
 * Environment variables are loaded from .env in the parent directory.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const cron         = require('node-cron');
const { run }      = require('./runner');
const { notifyError } = require('./notify');
const { CRON_SCHEDULE, CRON_TIMEZONE } = require('./config');

const runOnce = process.argv.includes('--once');

if (runOnce) {
  // ── One-shot mode ────────────────────────────────────────────────────────────
  console.log('Running in one-shot mode (--once). Will exit after completion.\n');
  run()
    .then(({ added, skipped, error }) => {
      if (error) process.exit(1);
      console.log(`\nSummary: ${added} added, ${skipped} duplicates skipped.`);
      process.exit(0);
    })
    .catch(async (err) => {
      await notifyError('Unhandled error in run()', err.stack ?? err.message);
      process.exit(1);
    });

} else {
  // ── Cron scheduler mode ──────────────────────────────────────────────────────
  console.log(`Apollo Lead Gen scheduler starting...`);
  console.log(`Schedule: ${CRON_SCHEDULE} (${CRON_TIMEZONE})`);
  console.log(`Next run at 7:00 AM Eastern Time.\n`);
  console.log('Tip: Run `node src/index.js --once` to trigger a run immediately.\n');

  cron.schedule(
    CRON_SCHEDULE,
    async () => {
      try {
        await run();
      } catch (err) {
        await notifyError('Unhandled error in scheduled run', err.stack ?? err.message);
      }
    },
    { timezone: CRON_TIMEZONE }
  );

  // Keep process alive
  process.on('SIGINT',  () => { console.log('\nScheduler stopped.'); process.exit(0); });
  process.on('SIGTERM', () => { console.log('\nScheduler stopped.'); process.exit(0); });
}
