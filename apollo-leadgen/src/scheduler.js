const cron = require('node-cron');
const config = require('./config');
const workflow = require('./workflow');
const notifier = require('./notifier');

function start() {
  const { cronExpression, timezone } = config.schedule;

  cron.schedule(
    cronExpression,
    () => {
      workflow.run().catch((err) => notifier.logError('scheduled run', err));
    },
    { timezone }
  );

  notifier.logInfo(
    `Scheduler started. Will run daily at 7:00 AM ${timezone} (cron: "${cronExpression}").`
  );
}

module.exports = { start };
