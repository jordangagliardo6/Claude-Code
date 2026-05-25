/**
 * HVAC Lead Generation Scheduler
 *
 * Runs the Apollo → Google Sheets workflow every day at 7:00 AM Eastern Time.
 * Start with: node src/index.js
 * Run once immediately: node src/run-once.js
 * Test connections only: node src/test-connections.js
 */

require('dotenv').config();
const cron = require('node-cron');
const { runWorkflow } = require('./workflow');
const config = require('./config');

const { cronExpression, timezone } = config.scheduler;

console.log('========================================');
console.log(' HVAC Lead Generation Scheduler');
console.log('========================================');
console.log(`Cron schedule : ${cronExpression} (${timezone})`);
console.log(`Max per run   : ${config.scheduler.maxLeadsPerRun} leads`);
console.log(`Spreadsheet   : ${config.google.spreadsheetId || '(not set)'}`);
console.log('');
console.log('Scheduler started. First run at 7:00 AM Eastern.');
console.log('Press Ctrl+C to stop.\n');

// Schedule the job — fires at 7:00 AM Eastern every day
cron.schedule(cronExpression, async () => {
  console.log(`[Scheduler] Triggered at ${new Date().toISOString()}`);
  try {
    await runWorkflow();
  } catch (err) {
    // Catch any uncaught errors from the workflow so the scheduler stays alive
    console.error('[Scheduler] Unexpected error in workflow:', err.message);
  }
}, {
  timezone,
  scheduled: true,
});
