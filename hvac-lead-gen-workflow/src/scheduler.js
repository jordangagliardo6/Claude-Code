// Long-running process that fires the workflow every morning at 7am Eastern.
// Start with `npm start` and leave it running (e.g. under pm2 or a system service).
//
// Alternative: skip this file entirely and point a system cron job at
// `node src/run.js` with the schedule `0 7 * * *` (set CRON_TZ=America/New_York
// in the crontab, or convert 7am ET to your server's local time).
require('dotenv').config();
const cron = require('node-cron');
const config = require('../config');
const { runWorkflow } = require('./run');

console.log(
  `Scheduler started. Will run every day at 7am ${config.schedule.timezone} ` +
    `(cron: "${config.schedule.cronExpression}").`
);
console.log('Press Ctrl+C to stop. Keep this process alive so the 7am job actually fires.');

cron.schedule(
  config.schedule.cronExpression,
  () => {
    runWorkflow().catch((err) => console.error('Unhandled error during scheduled run:', err));
  },
  { timezone: config.schedule.timezone }
);
