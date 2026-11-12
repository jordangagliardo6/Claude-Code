/**
 * index.js — HVAC Lead Generation Workflow
 *
 * Scheduled daily at 7 AM Eastern via node-cron.
 * Searches Apollo.io for SW Michigan HVAC companies (1-25 employees),
 * then appends up to 25 new leads to the master Google Sheet.
 *
 * Run immediately for a test:  node index.js --run-now
 * Start the scheduler:         node index.js
 */

require('dotenv').config();
const cron = require('node-cron');
const { searchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const cfg = require('./config');

// ── Entry point ──────────────────────────────────────────────────────────────

const RUN_NOW = process.argv.includes('--run-now');

if (RUN_NOW) {
  // One-shot mode — useful to verify the first connection before going live
  console.log('[Workflow] --run-now flag detected: running immediately.\n');
  run().catch((err) => {
    logError('Unhandled error in --run-now mode', err);
    process.exit(1);
  });
} else {
  console.log(
    `[Workflow] Scheduler started. Next run: daily at 7:00 AM Eastern (${cfg.CRON_SCHEDULE})`
  );
  console.log('[Workflow] Tip: run "node index.js --run-now" to test immediately.\n');

  cron.schedule(cfg.CRON_SCHEDULE, run, { timezone: cfg.CRON_TIMEZONE });
}

// ── Core workflow ────────────────────────────────────────────────────────────

async function run() {
  const startedAt = new Date().toISOString();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Workflow] Run started at ${startedAt}`);
  console.log(`${'─'.repeat(60)}`);

  let leads = [];

  // Step 1 — Fetch leads from Apollo.io
  try {
    console.log(`[Apollo] Searching for up to ${cfg.MAX_LEADS_PER_RUN} HVAC leads…`);
    leads = await searchLeads(cfg.MAX_LEADS_PER_RUN);
    console.log(`[Apollo] Done. ${leads.length} lead(s) returned from Apollo.`);
  } catch (err) {
    logError('Apollo search failed', err);
    await notify('Apollo search failed', err.message);
    return;
  }

  if (leads.length === 0) {
    console.log('[Workflow] Apollo returned 0 results. No rows written to Sheets.');
    // Not an error — just a dry run. No notification needed.
    return;
  }

  // Step 2 — Append to Google Sheets, skipping duplicates
  let result;
  try {
    console.log(`[Sheets] Writing to spreadsheet ID: ${process.env.SPREADSHEET_ID}`);
    result = await appendLeads(leads);
    console.log(
      `[Sheets] Done. Added: ${result.added} row(s)  |  Skipped (duplicate): ${result.skipped}`
    );
  } catch (err) {
    logError('Google Sheets write failed', err);
    await notify('Google Sheets write failed', err.message);
    return;
  }

  // Step 3 — Summary
  const finishedAt = new Date().toISOString();
  console.log(`\n[Workflow] ✓ Completed at ${finishedAt}`);
  console.log(`           ${result.added} new lead(s) added, ${result.skipped} duplicate(s) skipped.`);
  if (result.added > 0) {
    console.log(`           Sheet: https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}`);
  }
}

// ── Error logging & optional email alert ─────────────────────────────────────

function logError(context, err) {
  console.error(`\n[ERROR] ${context}`);
  console.error(`        ${err.message}`);
  if (err.stack) console.error(err.stack);
}

/**
 * Sends a simple console notification. Extend this to email via nodemailer
 * if you need inbox alerts — see the README for instructions.
 */
async function notify(subject, detail) {
  const alertEmail = process.env.ALERT_EMAIL;
  console.error(`\n[ALERT] ${subject}: ${detail}`);
  if (alertEmail) {
    console.error(`[ALERT] To enable email alerts to ${alertEmail}, see README.md → Email Alerts.`);
  }
  // nodemailer integration placeholder — uncomment and configure to activate:
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({ ... });
  // await transporter.sendMail({
  //   from: 'hvac-leads@yourapp.com',
  //   to: alertEmail,
  //   subject: `[HVAC Leads] ${subject}`,
  //   text: detail,
  // });
}
