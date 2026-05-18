'use strict';

const cron     = require('node-cron');
const config   = require('./config');
const logger   = require('./logger');
const workflow = require('./workflow');

function start() {
  logger.info(
    `Scheduler: job registered — "${config.CRON_SCHEDULE}" (${config.CRON_TIMEZONE}). ` +
    `Next run: every day at 7:00 AM Eastern.`
  );

  const task = cron.schedule(
    config.CRON_SCHEDULE,
    async () => {
      logger.info('Scheduler: triggering scheduled workflow run…');
      await workflow.runWorkflow();
    },
    {
      timezone: config.CRON_TIMEZONE,
      scheduled: true,
    }
  );

  // Graceful shutdown
  process.on('SIGTERM', () => { task.stop(); logger.info('Scheduler stopped (SIGTERM).'); });
  process.on('SIGINT',  () => { task.stop(); logger.info('Scheduler stopped (SIGINT).');  process.exit(0); });

  return task;
}

module.exports = { start };
