/**
 * Scheduler  —  runs the HVAC lead generation job every day at 7:00 AM Eastern.
 *
 * Start it with:   node scheduler.js
 * Keep it running: pm2 start scheduler.js --name hvac-lead-gen
 *                  or use your server's systemd / cron / task scheduler
 *
 * The cron expression "0 7 * * *" means "at 07:00 every day".
 * node-cron always interprets times in the system clock's timezone,
 * so the server must be set to America/New_York (ET).  If your server
 * is on UTC, change the expression to "0 12 * * *" (UTC 12:00 = ET 07:00 EST
 * or 08:00 EDT — see note below).
 *
 * Daylight Saving note:
 *   EST (Nov–Mar) = UTC-5  →  7 AM ET = 12:00 UTC  →  "0 12 * * *"
 *   EDT (Mar–Nov) = UTC-4  →  7 AM ET = 11:00 UTC  →  "0 11 * * *"
 *
 * Easiest fix: set TZ=America/New_York in your environment and keep "0 7 * * *".
 */

'use strict';

require('dotenv').config();

const cron = require('node-cron');

// Set timezone via environment if not already set at system level
process.env.TZ = process.env.TZ || 'America/New_York';

const SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *'; // 7:00 AM daily

function timestamp() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
}

console.log(`[Scheduler] Started at ${timestamp()}`);
console.log(`[Scheduler] Lead gen will run on schedule: ${SCHEDULE} (America/New_York)`);
console.log('[Scheduler] Press Ctrl+C to stop.\n');

if (!cron.validate(SCHEDULE)) {
  console.error(`[Scheduler] Invalid cron expression: "${SCHEDULE}"`);
  process.exit(1);
}

cron.schedule(SCHEDULE, async () => {
  console.log(`\n[Scheduler] Firing lead gen at ${timestamp()}`);

  try {
    // Dynamically require so each run gets a fresh module state
    delete require.cache[require.resolve('./lead-gen.js')];
    const { run } = require('./lead-gen.js');
    await run();
  } catch (err) {
    console.error(`[Scheduler] Run failed: ${err.message}`);
  }
}, {
  timezone: 'America/New_York',
});

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n[Scheduler] Shutting down gracefully.');
  process.exit(0);
});
