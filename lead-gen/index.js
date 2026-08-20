require('dotenv').config();
const cron = require('node-cron');
const { execFile } = require('child_process');
const path = require('path');

// 7:00 AM Eastern Time every day
// node-cron uses the local system timezone by default; we override with America/New_York
// so daylight saving transitions are handled automatically.
const SCHEDULE = '0 7 * * *';
const TIMEZONE = 'America/New_York';

function nextRunTime() {
  // Simple display — actual scheduling is handled by node-cron
  const now = new Date();
  const next = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
  next.setSeconds(0, 0);
  next.setMinutes(0);
  next.setHours(7);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next.toLocaleString('en-US', { timeZone: TIMEZONE });
}

console.log('HVAC Lead Gen Scheduler started.');
console.log(`Schedule: daily at 7:00 AM Eastern Time`);
console.log(`Next run: ${nextRunTime()}`);
console.log('Press Ctrl+C to stop.\n');

cron.schedule(
  SCHEDULE,
  () => {
    const ts = new Date().toISOString();
    console.log(`[${ts}] Cron fired — launching workflow.js...`);

    execFile(
      process.execPath,
      [path.join(__dirname, 'workflow.js')],
      { env: process.env },
      (err, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
        if (err) {
          console.error(`[${new Date().toISOString()}] Workflow process exited with error:`, err.message);
        } else {
          console.log(`[${new Date().toISOString()}] Workflow process finished.`);
        }
      }
    );
  },
  { timezone: TIMEZONE }
);
