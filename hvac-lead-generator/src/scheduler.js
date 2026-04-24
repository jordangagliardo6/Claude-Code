'use strict';
const cron = require('node-cron');
const config = require('./config');
const logger = require('./logger');
const { runWorkflow } = require('./workflow');

function startScheduler() {
  if (!cron.validate(config.cronSchedule)) {
    throw new Error(`Invalid cron expression: "${config.cronSchedule}"`);
  }

  logger.info('Scheduler started', {
    schedule: config.cronSchedule,
    timezone: config.cronTimezone,
    nextRun: 'Daily at 7:00 AM Eastern Time',
  });

  cron.schedule(config.cronSchedule, async () => {
    logger.info('Cron triggered — starting workflow run');
    await runWorkflow();
  }, {
    scheduled: true,
    timezone: config.cronTimezone,
  });
}

module.exports = { startScheduler };
