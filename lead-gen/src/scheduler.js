const cron = require('node-cron');
const config = require('./config');
const { runWorkflow } = require('./workflow');
const { notifyError } = require('./notify');

/**
 * Start the cron scheduler.
 * Fires runWorkflow() every morning at 7:00 AM Eastern Time.
 */
function startScheduler() {
  const { cronExpression, timezone } = config.scheduler;

  if (!cron.validate(cronExpression)) {
    throw new Error(`Invalid cron expression: "${cronExpression}"`);
  }

  console.log(`Scheduler started — will run daily at 7:00 AM ET`);
  console.log(`Cron: "${cronExpression}" (${timezone})`);
  console.log('Waiting for next scheduled run...\n');

  cron.schedule(
    cronExpression,
    async () => {
      try {
        await runWorkflow();
      } catch (err) {
        // Catch anything that escaped runWorkflow's own handlers
        console.error('Unhandled error in scheduled run:', err.message);
        await notifyError('Scheduler', err);
      }
    },
    { timezone }
  );
}

module.exports = { startScheduler };
