'use strict';

/**
 * Scheduler entry point.
 *
 * Runs the lead-generation workflow at 7:00 AM Eastern every day using
 * node-cron with the America/New_York timezone (DST-aware).
 *
 * Start with:  node index.js
 * Keep alive:  pm2 start index.js --name hvac-leads
 */

require('dotenv').config();
const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');
const { CRON_SCHEDULE, CRON_TIMEZONE } = require('./src/config');

console.log('─'.repeat(60));
console.log(' HVAC Lead Generator — Scheduler');
console.log(` Schedule : ${CRON_SCHEDULE} (${CRON_TIMEZONE})`);
console.log(`  → Runs  : 7:00 AM Eastern every day`);
console.log(`  → Leads : up to 25 new per run`);
console.log('─'.repeat(60));
console.log('Scheduler is running. Press Ctrl+C to stop.\n');

cron.schedule(
  CRON_SCHEDULE,
  () => {
    runWorkflow().catch(err => {
      // Last-resort catch — runWorkflow() handles its own errors internally,
      // but this guards against any unexpected throw.
      console.error('[Scheduler] Unhandled error in workflow:', err.message);
    });
  },
  { timezone: CRON_TIMEZONE }
);
