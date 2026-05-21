/**
 * Cron scheduler — wraps the workflow in a node-cron job.
 * Schedule and timezone are controlled by src/config.js.
 */

const cron   = require('node-cron');
const config = require('./config');
const logger = require('./logger');
const { runWorkflow } = require('./workflow');

function startScheduler() {
  if (!cron.validate(config.cronSchedule)) {
    throw new Error(`Invalid cron expression in config: "${config.cronSchedule}"`);
  }

  logger.info(
    `Scheduler armed — will fire at ${config.cronSchedule} (${config.cronTimezone})`
  );

  cron.schedule(
    config.cronSchedule,
    async () => {
      logger.info('Cron triggered — starting workflow run');
      try {
        await runWorkflow();
      } catch (err) {
        // Error already logged and alerted inside runWorkflow
      }
    },
    {
      scheduled: true,
      timezone:  config.cronTimezone,
    }
  );
}

module.exports = { startScheduler };
