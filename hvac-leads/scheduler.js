/**
 * Scheduler entry point.
 * Runs the HVAC lead generator on the configured cron schedule (default: 7am ET daily).
 * Start with: node scheduler.js
 */
require('dotenv').config();
const cron = require('node-cron');
const { runLeadGeneration } = require('./src/leadGenerator');
const { config } = require('./src/config');

const schedule = config.cronSchedule;
console.log(`[Scheduler] Starting. Job scheduled: "${schedule}" (server local time).`);
console.log(`[Scheduler] Tip: make sure your server timezone is set to America/New_York,`);
console.log(`            or prefix your start command with: TZ=America/New_York node scheduler.js`);

cron.schedule(schedule, async () => {
  console.log(`\n[Scheduler] Firing job at ${new Date().toISOString()}`);
  const result = await runLeadGeneration();
  if (!result.success) {
    console.error(`[Scheduler] Run failed: ${result.error}`);
    // The error is already logged to console; add email/webhook alerting here if desired.
  }
}, {
  scheduled: true,
  timezone: 'America/New_York',
});

console.log('[Scheduler] Ready and waiting. Press Ctrl+C to stop.');
