// scheduler.js
//
// Entry point for the always-on process. Runs the workflow once
// immediately on startup is intentionally NOT done here -- use
// `node test-connections.js` (connectivity only) or `node -e
// "require('./src/runWorkflow').runWorkflow()"` (a real, live run) to test
// by hand. This file just arms the daily 7:00 AM Eastern cron job.
//
// Keep this process running (pm2, systemd, a `screen`/`tmux` session, a
// Docker container, etc.) for the schedule to actually fire.

require('dotenv').config();
const cron = require('node-cron');
const config = require('./config');
const logger = require('./src/logger');
const { runWorkflow } = require('./src/runWorkflow');

logger.info(`Lead gen scheduler started. Will run daily at 7:00 AM ${config.cronTimezone} (cron: "${config.cronSchedule}").`);

cron.schedule(
  config.cronSchedule,
  () => {
    logger.info('Scheduled run triggered.');
    runWorkflow().catch((err) => logger.error(`Unhandled error in scheduled run: ${err.message}`));
  },
  { timezone: config.cronTimezone }
);
