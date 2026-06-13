'use strict';
require('dotenv').config();
const cron = require('node-cron');
const { fetchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { sendAlert } = require('./mailer');
const config = require('./config');
const log = require('./logger');

// ─── Core workflow ─────────────────────────────────────────────────────────────

async function runWorkflow() {
  log.info('═══ Starting HVAC lead generation run ═══');

  let leads = [];

  // 1. Fetch from Apollo
  try {
    leads = await fetchLeads(config.maxLeadsPerRun);
  } catch (err) {
    const msg = `Apollo fetch failed: ${err.message}`;
    log.error(msg);
    await sendAlert('Apollo Fetch Error', `${msg}\n\nFull error:\n${err.stack}`);
    return;
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned 0 leads matching your filters. No rows were written.';
    log.warn(msg);
    await sendAlert('No Leads Returned', msg);
    return;
  }

  log.info(`Fetched ${leads.length} candidate leads from Apollo.`);

  // 2. Write to Google Sheets
  let result;
  try {
    result = await appendLeads(leads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    log.error(msg);
    await sendAlert('Google Sheets Write Error', `${msg}\n\nFull error:\n${err.stack}`);
    return;
  }

  log.success(`Run complete — ${result.added} new leads added, ${result.skipped} skipped (duplicates).`);
  log.info('═══════════════════════════════════════════');
}

// ─── Entry point ───────────────────────────────────────────────────────────────

const runOnce = process.argv.includes('--run-once');

if (runOnce) {
  // Useful for testing or manual one-off runs: `node index.js --run-once`
  log.info('Running in one-shot mode (--run-once).');
  runWorkflow().catch((err) => {
    log.error('Unhandled error:', err);
    process.exit(1);
  });
} else {
  // Scheduled mode: runs every day at 7 AM Eastern
  log.info(`Scheduler started. Next run at 7:00 AM Eastern (cron: "${config.cronSchedule}").`);
  log.info('Press Ctrl+C to stop.');

  cron.schedule(config.cronSchedule, runWorkflow, {
    timezone: config.cronTimezone,
  });
}
