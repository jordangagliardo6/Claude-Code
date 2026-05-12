// Cron scheduler — fires the workflow every day at 7:00 AM Eastern Time
const cron     = require('node-cron');
const config   = require('./config');
const workflow = require('./workflow');
const logger   = require('./logger');

function start() {
  const { cronExpression, timezone } = config.scheduler;

  logger.info(
    `Scheduler armed: "${cronExpression}" (${timezone}) — next fire at 7:00 AM ET daily.`
  );

  cron.schedule(
    cronExpression,
    async () => {
      logger.info('Cron triggered — starting workflow...');
      try {
        await workflow.run();
      } catch (err) {
        // Belt-and-suspenders: workflow.run() handles its own errors,
        // but catch here so an uncaught throw can't kill the process.
        logger.error(`Unexpected scheduler error: ${err.message}`);
      }
    },
    { timezone }
  );
}

module.exports = { start };
