'use strict';

require('dotenv').config();
const cron = require('node-cron');
const { run } = require('./src/workflow');
const { log } = require('./src/logger');

// ──────────────────────────────────────────────────────────────────────────────
// Entry point
//
//  node index.js            → start the scheduler (runs daily at 7 AM ET)
//  node index.js --run-now  → execute one run immediately, then exit
// ──────────────────────────────────────────────────────────────────────────────

if (process.argv.includes('--run-now')) {
  // One-shot manual execution
  log('Manual run triggered via --run-now flag');
  run().then((result) => {
    console.log('\nResult:', JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
} else {
  // Persistent scheduler
  log('Apollo HVAC Lead Gen — Scheduler starting');
  log('Runs: daily at 7:00 AM Eastern Time');
  log('Timezone: America/New_York (handles EST/EDT automatically)');
  log('Press Ctrl+C to stop.\n');

  // node-cron timezone support requires tzdata to be installed on the OS.
  // On most Linux/macOS systems this works out of the box.
  cron.schedule(
    '0 7 * * *', // 7:00 AM every day
    async () => {
      log('Scheduled run triggered by cron');
      await run();
    },
    {
      timezone: 'America/New_York',
    },
  );
}
