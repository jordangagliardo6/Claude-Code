const apollo = require('./apollo');
const sheets = require('./sheets');
const logger = require('./logger');
const { sendAlert } = require('./notifier');

const DIVIDER = '══════════════════════════════════════════════';

// Run one full cycle: pull leads from Apollo, deduplicate, write to Sheets.
// Returns a result object so callers can inspect the outcome.
async function runWorkflow() {
  logger.info(DIVIDER);
  logger.info('  HVAC Lead Gen — Workflow Run Starting');
  logger.info(DIVIDER);

  // ── Step 1: Apollo search ──────────────────────────────────────────────────
  let leads = [];
  try {
    leads = await apollo.searchLeads();
  } catch (err) {
    const msg = `Apollo.io search failed: ${err.message}`;
    logger.error('[Workflow] ' + msg, err);
    await sendAlert('Apollo Search Failed', msg);
    return { success: false, leadsFound: 0, leadsWritten: 0, error: msg };
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned zero results for the current filters — no leads to process';
    logger.warn('[Workflow] ' + msg);
    await sendAlert('No Apollo Results', msg);
    return { success: true, leadsFound: 0, leadsWritten: 0 };
  }

  // ── Step 2: Write to Google Sheets ────────────────────────────────────────
  let written = 0;
  try {
    written = await sheets.writeLeads(leads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    logger.error('[Workflow] ' + msg, err);
    await sendAlert('Google Sheets Write Failed', msg);
    return { success: false, leadsFound: leads.length, leadsWritten: 0, error: msg };
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  logger.success(
    `[Workflow] Done — ${leads.length} leads fetched, ${written} new entries added to sheet`
  );
  logger.info(DIVIDER + '\n');

  return { success: true, leadsFound: leads.length, leadsWritten: written };
}

module.exports = { runWorkflow };
