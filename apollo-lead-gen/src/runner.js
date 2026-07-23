'use strict';

// Core workflow: search Apollo → filter duplicates → write to Sheets.
// Called by both the cron scheduler and the --run-now CLI flag.

const { searchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const log             = require('./logger');

async function run() {
  const maxLeads = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
  log.info(`=== Lead gen run started (max ${maxLeads} leads) ===`);

  let leads;

  // ── Step 1: Fetch from Apollo ─────────────────────────────────────────────
  try {
    leads = await searchLeads(maxLeads);
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    log.error(msg, err);
    await log.sendAlert('Apollo search failed', `${msg}\n\nCheck APOLLO_API_KEY and your Apollo plan limits.`);
    return { success: false, error: msg };
  }

  if (!leads || leads.length === 0) {
    const msg = 'Apollo returned 0 results — no leads found for this run';
    log.warn(msg);
    await log.sendAlert('No leads found', `${msg}\n\nTry widening the city list or industry keywords in src/config.js.`);
    return { success: false, error: msg };
  }

  // ── Step 2: Write to Google Sheets ───────────────────────────────────────
  let result;
  try {
    result = await appendLeads(leads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    log.error(msg, err);
    await log.sendAlert(
      'Google Sheets write failed',
      `${msg}\n\nCheck:\n` +
      '  • GOOGLE_SPREADSHEET_ID is correct\n' +
      '  • service-account.json exists and is valid\n' +
      '  • The sheet has been shared with the service account email\n' +
      '  • GOOGLE_SHEET_NAME matches the actual tab name'
    );
    return { success: false, error: msg };
  }

  // ── Step 3: Summary ───────────────────────────────────────────────────────
  log.info(`=== Run complete — added: ${result.added}, skipped (duplicates): ${result.skipped} ===`);
  return { success: true, ...result };
}

module.exports = { run };
