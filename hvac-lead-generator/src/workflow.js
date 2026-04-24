'use strict';
const { searchLeads } = require('./apolloService');
const { writeLeads } = require('./sheetsService');
const { sendAlert, sendRunSummary } = require('./notifier');
const logger = require('./logger');
const config = require('./config');

// ─── MAIN WORKFLOW ────────────────────────────────────────────────────────────

// Runs one full cycle: search Apollo → deduplicate → write to sheet → notify.
// All errors are caught here so the scheduler never crashes on a bad run.
async function runWorkflow() {
  const runStart = new Date();
  logger.info('=== Workflow run started ===', {
    time: runStart.toLocaleString('en-US', { timeZone: 'America/New_York' }),
    maxLeads: config.maxLeadsPerRun,
  });

  let leads = [];
  let added = 0;
  let skipped = 0;

  // ── Step 1: Fetch from Apollo ────────────────────────────────────────────
  try {
    leads = await searchLeads();

    if (leads.length === 0) {
      const msg = 'Apollo returned zero usable leads for this run. No rows written.';
      logger.warn(msg);
      await sendAlert('No leads returned', msg);
      return;
    }
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    logger.error(msg, { stack: err.stack });
    await sendAlert('Apollo search error', `${msg}\n\nCheck your APOLLO_API_KEY and try again.`);
    return;
  }

  // ── Step 2: Write to Google Sheets ───────────────────────────────────────
  try {
    ({ added, skipped } = await writeLeads(leads));
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    logger.error(msg, { stack: err.stack });
    await sendAlert(
      'Google Sheets write error',
      `${msg}\n\nCheck your SPREADSHEET_ID and that the service account has edit access.`
    );
    return;
  }

  // ── Step 3: Summary ──────────────────────────────────────────────────────
  const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
  logger.success(`=== Run complete: ${added} added, ${skipped} skipped, ${elapsed}s ===`);

  if (config.notificationEmail) {
    await sendRunSummary(added, skipped);
  }
}

module.exports = { runWorkflow };
