/**
 * index.js — Entry point
 *
 * Starts the scheduler (runs workflow every day at 7:00 AM Eastern).
 * To do an immediate one-off run: node index.js --run-now
 */

require('dotenv').config();
const cron = require('node-cron');
const { runWorkflow } = require('./src/workflow');
const path = require('path');

// ── Configuration (all from .env) ────────────────────────────────────────────

const config = {
  apolloApiKey:      process.env.APOLLO_API_KEY,
  sheetId:           process.env.GOOGLE_SHEET_ID,
  sheetTab:          process.env.GOOGLE_SHEET_TAB ?? 'Leads',
  maxLeads:          parseInt(process.env.MAX_LEADS_PER_RUN ?? '25', 10),
  credentialsPath:   path.resolve(process.env.GOOGLE_CREDENTIALS_PATH ?? './credentials/google-credentials.json'),
  tokenPath:         path.resolve(process.env.GOOGLE_TOKEN_PATH ?? './credentials/token.json'),
  notificationEmail: process.env.NOTIFICATION_EMAIL ?? '',
};

// ── Validation ────────────────────────────────────────────────────────────────

function validateConfig() {
  const missing = [];
  if (!config.apolloApiKey) missing.push('APOLLO_API_KEY');
  if (!config.sheetId)      missing.push('GOOGLE_SHEET_ID');
  if (missing.length) {
    console.error(`\n[Config] Missing required environment variables: ${missing.join(', ')}`);
    console.error('[Config] Copy .env.example to .env and fill in the values.\n');
    process.exit(1);
  }
}

// ── Error notification ────────────────────────────────────────────────────────

/**
 * Logs the error prominently. Extend this function to send an email alert
 * via Nodemailer or a webhook if you want push notifications on failures.
 */
function notifyError(err) {
  console.error('\n' + '!'.repeat(60));
  console.error('[ALERT] Workflow failed — manual check required');
  console.error(`[ALERT] Error: ${err.message}`);
  if (config.notificationEmail) {
    console.error(`[ALERT] Send alert to: ${config.notificationEmail}`);
    // To enable email alerts, install nodemailer and uncomment:
    // await sendEmailAlert(config.notificationEmail, err.message);
  }
  console.error('!'.repeat(60) + '\n');
}

// ── Scheduled job ─────────────────────────────────────────────────────────────

/**
 * Wraps runWorkflow with error handling so a failure doesn't crash the scheduler.
 */
async function scheduledRun() {
  try {
    await runWorkflow(config);
  } catch (err) {
    notifyError(err);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

validateConfig();

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // Manual one-off run (used for testing and first-time setup)
  console.log('[Scheduler] --run-now flag detected — executing immediately.');
  scheduledRun().then(() => process.exit(0)).catch(() => process.exit(1));
} else {
  // Schedule: 7:00 AM every day, Eastern Time
  // Cron format: minute hour day-of-month month day-of-week
  const JOB_SCHEDULE = '0 7 * * *';

  console.log('\n[Scheduler] HVAC Lead Gen started.');
  console.log(`[Scheduler] Scheduled for 7:00 AM Eastern every day.`);
  console.log(`[Scheduler] Max leads per run: ${config.maxLeads}`);
  console.log('[Scheduler] To run immediately: node index.js --run-now');
  console.log('[Scheduler] Waiting for next scheduled time…\n');

  cron.schedule(JOB_SCHEDULE, scheduledRun, {
    timezone: 'America/New_York',
  });
}
