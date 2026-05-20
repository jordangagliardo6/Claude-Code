const { fetchLeads } = require('./apollo');
const { writeLeadsToSheet } = require('./sheets');
const logger = require('./logger');

const MAX_LEADS_PER_RUN = 25;

/**
 * Full end-to-end run: search Apollo → deduplicate → write to Google Sheet.
 * Throws on fatal errors so the caller (cron or CLI) can handle/log them.
 */
async function runLeadGeneration() {
  logger.separator();
  logger.info(`Lead generation run started — max ${MAX_LEADS_PER_RUN} leads.`);

  // ── Step 1: Fetch from Apollo ──────────────────────────────────────────────
  let leads;
  try {
    leads = await fetchLeads(MAX_LEADS_PER_RUN);
  } catch (err) {
    logger.error('APOLLO FETCH FAILED', err);
    logger.error('ACTION REQUIRED: Check Apollo API key and search parameters.');
    // Re-throw so the caller can surface it (cron logger / process exit)
    throw err;
  }

  if (leads.length === 0) {
    logger.warn('No qualifying leads returned from Apollo. Nothing written to sheet.');
    logger.warn('ACTION REQUIRED: Verify Apollo search filters or check for API quota limits.');
    return { fetched: 0, written: 0 };
  }

  logger.info(`Fetched ${leads.length} qualifying leads from Apollo.`);

  // ── Step 2: Write to Google Sheet ─────────────────────────────────────────
  let written;
  try {
    written = await writeLeadsToSheet(leads);
  } catch (err) {
    logger.error('GOOGLE SHEETS WRITE FAILED', err);
    logger.error('ACTION REQUIRED: Check service account key, spreadsheet ID, and sharing permissions.');
    throw err;
  }

  // ── Step 3: Summary ────────────────────────────────────────────────────────
  logger.success(`Run complete — ${written} new lead(s) added to sheet (${leads.length - written} duplicate(s) skipped).`);
  logger.separator();

  return { fetched: leads.length, written };
}

module.exports = { runLeadGeneration };
