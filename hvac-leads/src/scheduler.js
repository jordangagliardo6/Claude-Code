'use strict';

const cron = require('node-cron');
const config = require('./config');
const { runWorkflow } = require('./workflow');

// ─── Error notification helper ────────────────────────────────────────────────
// Logs the error and, if NOTIFICATION_EMAIL is set, prints a clear alert.
// Extend this function to send a real email via nodemailer/SendGrid/etc.
function handleError(err) {
  const timestamp = new Date().toISOString();
  console.error(`\n[${timestamp}] *** WORKFLOW ERROR ***`);
  console.error(err.message);
  console.error('────────────────────────────────────────────────────────────────');

  const email = config.NOTIFICATION_EMAIL();
  if (email) {
    // Placeholder — swap for real email logic (nodemailer, SendGrid, etc.)
    console.error(`TODO: send error notification to ${email}`);
    console.error(`Subject: HVAC Lead Scraper failed — ${timestamp}`);
    console.error(`Body: ${err.message}`);
  } else {
    console.error('No NOTIFICATION_EMAIL set — error logged to console only.');
  }
  console.error('────────────────────────────────────────────────────────────────\n');
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
function startScheduler() {
  config.validateEnv();

  console.log('HVAC Lead Scheduler starting…');
  console.log(`  Schedule:  ${config.CRON_SCHEDULE} (${config.CRON_TIMEZONE})`);
  console.log(`  Max leads: ${config.MAX_LEADS_PER_RUN} per run`);
  console.log(`  Sheet ID:  ${config.GOOGLE_SHEET_ID()}`);
  console.log('  Waiting for next scheduled run. Press Ctrl+C to stop.\n');

  cron.schedule(
    config.CRON_SCHEDULE,
    async () => {
      try {
        await runWorkflow();
      } catch (err) {
        handleError(err);
      }
    },
    { timezone: config.CRON_TIMEZONE }
  );
}

startScheduler();
