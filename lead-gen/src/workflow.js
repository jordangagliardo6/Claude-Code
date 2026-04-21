'use strict';

require('dotenv').config();
const logger = require('./logger');
const { searchHVACLeads } = require('./apollo');
const { ensureHeaders, getExistingBusinessNames, appendLeads } = require('./sheets');

// ─────────────────────────────────────────────────────────────────────────────
// Main workflow — called by the scheduler and run-now.js.
//
// Pulls up to MAX_LEADS_PER_RUN new HVAC leads from Apollo, deduplicates
// against the spreadsheet, then appends the fresh leads.
// ─────────────────────────────────────────────────────────────────────────────
async function runWorkflow() {
  const maxLeads = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
  logger.info(`─── Workflow started — target ${maxLeads} new leads ───`);

  let apolloLeads = [];
  let written = 0;

  // ── Step 1: Fetch from Apollo ─────────────────────────────────────────────
  try {
    // Request exactly maxLeads from page 1.  If more pages exist and we didn't
    // collect enough phone-valid contacts, continue fetching.
    let page = 1;
    const perPage = Math.min(maxLeads, 25); // Apollo caps per_page at 25

    while (apolloLeads.length < maxLeads) {
      const { leads, totalPages } = await searchHVACLeads(page, perPage);

      if (leads.length === 0) {
        logger.info('Apollo returned no (phone-valid) results on this page — stopping pagination');
        break;
      }

      apolloLeads.push(...leads);
      logger.info(`Collected ${apolloLeads.length} phone-valid leads so far`);

      if (page >= totalPages) break;
      page++;

      // Polite pause between pages to avoid hitting rate limits.
      await sleep(1000);
    }

    // Trim to exactly what we need so a single run never overwhelms the sheet.
    apolloLeads = apolloLeads.slice(0, maxLeads);
  } catch (err) {
    await logger.alert(
      'Apollo search failed',
      `The Apollo.io API call failed during the scheduled lead-gen run.\n\nError: ${err.message}\n\nStack:\n${err.stack}`
    );
    return { success: false, written: 0, error: err.message };
  }

  if (apolloLeads.length === 0) {
    await logger.alert(
      'Apollo returned zero leads',
      'The Apollo search completed without errors but returned no leads with phone numbers. ' +
        'This may indicate the search filters are too narrow or the account has no remaining credits.'
    );
    return { success: false, written: 0, error: 'No leads returned from Apollo' };
  }

  logger.info(`Apollo phase complete — ${apolloLeads.length} candidate lead(s)`);

  // ── Step 2: Write to Google Sheets ────────────────────────────────────────
  try {
    await ensureHeaders();
    const existing = await getExistingBusinessNames();
    logger.info(`Spreadsheet has ${existing.size} existing business(es) — checking for duplicates`);

    written = await appendLeads(apolloLeads, existing);
  } catch (err) {
    await logger.alert(
      'Google Sheets write failed',
      `Failed to write leads to the spreadsheet.\n\nError: ${err.message}\n\nStack:\n${err.stack}`
    );
    return { success: false, written: 0, error: err.message };
  }

  logger.info(`─── Workflow complete — ${written} new lead(s) added ───`);
  return { success: true, written };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { runWorkflow };
