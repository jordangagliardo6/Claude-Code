// ---------------------------------------------------------------------------
// Production entry point: `npm start`
//
// Boots the phone-reveal webhook server (if configured) and schedules the
// lead-gen workflow to run every morning at 7am Eastern via node-cron.
// Keep this process running continuously (e.g. under pm2, systemd, or a
// Docker container with a restart policy) — node-cron only fires while the
// process is alive.
// ---------------------------------------------------------------------------

require('dotenv').config();
const cron = require('node-cron');
const config = require('./config');
const { runWorkflowOnce } = require('./src/workflow');
const { startWebhookServer } = require('./src/phoneWebhookServer');
const { notifyError, notifyInfo } = require('./src/notifier');

if (config.phoneRevealWebhookUrl) {
  startWebhookServer();
} else {
  notifyInfo('PHONE_REVEAL_WEBHOOK_URL not set — running without phone-reveal enrichment.');
}

cron.schedule(
  config.cronExpression,
  () => {
    runWorkflowOnce().catch((err) => {
      // runWorkflowOnce already alerts on specific failures; this is a
      // last-resort catch so an unexpected error never crashes the process.
      notifyError('Scheduled run failed unexpectedly', err);
    });
  },
  { timezone: config.timezone }
);

notifyInfo(
  `Scheduler started. Workflow will run daily at 7:00 AM ${config.timezone} ` +
    `(cron: "${config.cronExpression}"). Process must stay running.`
);
