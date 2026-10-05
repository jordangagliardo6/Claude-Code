// ─── Scheduler Entry Point ────────────────────────────────────────────────────
// Starts the cron job that fires the lead gen workflow every morning at 7am ET.
// Run with: node index.js   (keeps running in the background)

require('dotenv').config();

const cron     = require('node-cron');
const config   = require('./config');
const { runWorkflow } = require('./workflow');

console.log('HVAC Lead Gen — Scheduler starting...');
console.log(`Schedule: ${config.cronSchedule} (${config.cronTimezone})`);
console.log('Next run: 7:00 AM Eastern Time\n');

// Validate that node-cron supports the timezone
if (!cron.validate(config.cronSchedule)) {
  console.error('[ERROR] Invalid cron expression in config.js:', config.cronSchedule);
  process.exit(1);
}

cron.schedule(config.cronSchedule, async () => {
  try {
    await runWorkflow();
  } catch (err) {
    // Catch-all — runWorkflow handles its own errors, but just in case
    console.error('[FATAL] Unhandled error in runWorkflow:', err.message);
  }
}, { timezone: config.cronTimezone });

console.log('Scheduler is running. Press Ctrl+C to stop.\n');

// Keep the process alive (cron does this automatically, but this makes it explicit)
process.on('SIGINT', () => {
  console.log('\nScheduler stopped.');
  process.exit(0);
});
