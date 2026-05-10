const cron = require('node-cron');
const config = require('./config');
const logger = require('./logger');
const { runWorkflow } = require('./workflow');

function startScheduler() {
  const { cronExpression, timezone } = config.schedule;

  if (!cron.validate(cronExpression)) {
    logger.error(`[Scheduler] Invalid cron expression: "${cronExpression}"`);
    process.exit(1);
  }

  // Human-readable description of the schedule
  const scheduleDesc = cronExpression === '0 7 * * *'
    ? '7:00 AM every day'
    : cronExpression;

  logger.info(`[Scheduler] Cron: "${cronExpression}" | Timezone: ${timezone} | Runs at: ${scheduleDesc}`);

  cron.schedule(
    cronExpression,
    async () => {
      logger.info('[Scheduler] Cron trigger fired — starting workflow run');
      try {
        await runWorkflow();
      } catch (err) {
        // runWorkflow() handles its own errors and alerts, but catch anything that
        // slips through so the scheduler keeps running
        logger.error('[Scheduler] Unhandled error in scheduled run', err);
      }
    },
    { timezone }
  );

  logger.success('[Scheduler] Active — process will stay running and execute at the scheduled time');
  logger.info('[Scheduler] Press Ctrl+C to stop\n');
}

module.exports = { startScheduler };
