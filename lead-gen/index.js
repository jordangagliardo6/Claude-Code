'use strict';

require('dotenv').config();

const cron = require('node-cron');
const { fetchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { CRON_SCHEDULE, CRON_TIMEZONE, MAX_LEADS_PER_RUN } = require('./config');

// ─── Error Notification ───────────────────────────────────────────────────────

/**
 * Log an error and emit a clear notification block so it stands out in logs/email.
 * Extend this function if you want to add SMTP, Slack, or SMS alerts later.
 */
function notifyError(context, err) {
  const email = process.env.NOTIFICATION_EMAIL || 'your-email@example.com';
  const timestamp = new Date().toISOString();

  const message = [
    '',
    '╔══════════════════════════════════════════════════════════╗',
    '║              LEAD-GEN WORKFLOW ERROR                     ║',
    '╚══════════════════════════════════════════════════════════╝',
    `  Time      : ${timestamp}`,
    `  Context   : ${context}`,
    `  Error     : ${err.message}`,
    `  Notify    : ${email}`,
    '',
    '  Action required: Check the logs and re-run manually when fixed.',
    '  Command  : node index.js --run-now',
    '',
    '══════════════════════════════════════════════════════════════',
    '',
  ].join('\n');

  console.error(message);

  // If you want email alerts, add nodemailer or similar here.
  // The NOTIFICATION_EMAIL env var is already wired up for you.
}

// ─── Core Workflow ────────────────────────────────────────────────────────────

/**
 * Run one complete lead-generation cycle:
 *   1. Fetch leads from Apollo.io
 *   2. Append new (non-duplicate) leads to the Google Sheet
 */
async function runWorkflow() {
  const startedAt = new Date().toISOString();
  console.log(`\n[Workflow] Starting lead-gen run at ${startedAt}`);
  console.log(`[Workflow] Target: up to ${MAX_LEADS_PER_RUN} new HVAC leads in Southwest Michigan`);

  // ── Step 1: Pull leads from Apollo ────────────────────────────────────────
  let leads;
  try {
    leads = await fetchLeads();
  } catch (err) {
    notifyError('Apollo.io fetch', err);
    return;
  }

  if (leads.length === 0) {
    notifyError(
      'Apollo.io returned zero results',
      new Error(
        'Apollo returned no results for the current city/industry filters. ' +
        'The niche may be exhausted — try expanding TARGET_CITIES in config.js.'
      )
    );
    return;
  }

  // ── Step 2: Append to Google Sheet ────────────────────────────────────────
  let result;
  try {
    result = await appendLeads(leads);
  } catch (err) {
    notifyError('Google Sheets write', err);
    return;
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(
    `\n[Workflow] Run complete. Added: ${result.added} | Skipped (duplicates): ${result.skipped}`
  );
  console.log(`[Workflow] Finished at ${new Date().toISOString()}\n`);
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

const runNowFlag = process.argv.includes('--run-now');

if (runNowFlag) {
  // Manual one-shot run: node index.js --run-now
  console.log('[Scheduler] --run-now flag detected. Running immediately then exiting.');
  runWorkflow().then(() => process.exit(0)).catch((err) => {
    console.error('[Scheduler] Unexpected error:', err);
    process.exit(1);
  });
} else {
  // Scheduled mode: keep process alive and run on cron
  console.log(`[Scheduler] HVAC Lead-Gen Workflow started.`);
  console.log(`[Scheduler] Schedule: ${CRON_SCHEDULE} (${CRON_TIMEZONE})`);
  console.log(`[Scheduler] Next run: 7:00 AM Eastern every day.`);
  console.log(`[Scheduler] Tip: run  node index.js --run-now  to test immediately.\n`);

  cron.schedule(CRON_SCHEDULE, runWorkflow, {
    timezone: CRON_TIMEZONE,
  });
}
