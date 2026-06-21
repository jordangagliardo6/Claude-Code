#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Keeps a process alive and fires the workflow every morning at 7am Eastern.
// Run this with a process manager (pm2, systemd, a `screen`/`tmux` session,
// or Docker restart:always) so it survives reboots -- node-cron only keeps
// the schedule while this process is running.
//
// Prefer a plain OS cron job instead? Skip this file and point cron at:
//   0 7 * * * cd /path/to/apollo-lead-gen && /usr/bin/node src/runWorkflow.js
// (still set the timezone in your crontab or via `TZ=America/New_York`).
// ---------------------------------------------------------------------------
require('dotenv').config();
const cron = require('node-cron');
const config = require('./config');
const logger = require('./logger');
const { run } = require('./src/runWorkflow');

logger.info(
  `Scheduler started. Will run every day at 7:00 AM (${config.schedule.timezone}) using cron expression "${config.schedule.cronExpression}".`
);

cron.schedule(
  config.schedule.cronExpression,
  () => {
    run().catch(async (err) => {
      await logger.alert('Unexpected workflow error', err.stack || err.message);
    });
  },
  { timezone: config.schedule.timezone }
);
