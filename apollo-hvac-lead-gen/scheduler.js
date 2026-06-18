// Runs the workflow every morning at the time set in config.cronSchedule
// (default 7:00 AM America/New_York). Start with: npm start
// Keep this process running (pm2, a systemd service, screen/tmux, etc.) --
// node-cron only fires while the process is alive.

const cron = require('node-cron');
const config = require('./config');
const { runSafely } = require('./src/runWorkflow');
const { logInfo } = require('./src/notify');

logInfo(
  `Scheduler started. Will run at "${config.cronSchedule}" (${config.cronTimezone}). Leave this process running.`
);

cron.schedule(config.cronSchedule, runSafely, { timezone: config.cronTimezone });
