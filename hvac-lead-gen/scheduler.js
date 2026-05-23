'use strict';

require('dotenv').config();
const cron = require('node-cron');
const config = require('./src/config');
const { runWorkflow } = require('./src/workflow');

// Validate the cron expression before we start
if (!cron.validate(config.CRON_SCHEDULE)) {
  console.error(`Invalid CRON_SCHEDULE: "${config.CRON_SCHEDULE}". Exiting.`);
  process.exit(1);
}

console.log('─────────────────────────────────────────────────');
console.log('  HVAC Lead Gen Scheduler — SW Michigan');
console.log('─────────────────────────────────────────────────');
console.log(`  Schedule : ${config.CRON_SCHEDULE} (${process.env.TZ || 'server local time'})`);
console.log(`  Max leads: ${config.MAX_LEADS_PER_RUN} per run`);
console.log(`  Sheet ID : ${config.SPREADSHEET_ID}`);
console.log('─────────────────────────────────────────────────');
console.log('  Scheduler is running. Press Ctrl+C to stop.');
console.log('');

// Schedule the workflow
cron.schedule(config.CRON_SCHEDULE, async () => {
  console.log(`\n[scheduler] Triggered at ${new Date().toISOString()}`);
  try {
    await runWorkflow();
  } catch (err) {
    // Outer safety net — workflow.js handles its own errors, but just in case
    console.error('[scheduler] Unexpected uncaught error:', err);
  }
}, {
  timezone: process.env.TZ || 'America/New_York',
});

// Keep the process alive
process.on('SIGINT', () => {
  console.log('\n[scheduler] Shutting down gracefully.');
  process.exit(0);
});
