// ─── HVAC Lead Generation Scheduler ──────────────────────────────────────────
// Runs the lead generation workflow at 7:00 AM Eastern Time every day.
// Start with: node index.js
// Or run once immediately: node run-now.js

require('dotenv').config();
const cron = require('node-cron');
const config = require('./config');
const { runLeadGenWorkflow } = require('./src/workflow');
const { notifyError } = require('./src/notify');

console.log(`[${new Date().toISOString()}] HVAC Lead Gen scheduler starting…`);
console.log(`Schedule: "${config.cronSchedule}" (${config.cronTimezone})`);
console.log(`Target spreadsheet: https://docs.google.com/spreadsheets/d/${config.sheets.spreadsheetId}`);
console.log('Waiting for next scheduled run. Press Ctrl+C to stop.\n');

cron.schedule(
  config.cronSchedule,
  async () => {
    try {
      const result = await runLeadGenWorkflow(config);
      console.log(`\n[${new Date().toISOString()}] Run result:`, result);
    } catch (err) {
      notifyError(err, config);
    }
  },
  {
    scheduled: true,
    timezone: config.cronTimezone,
  }
);
