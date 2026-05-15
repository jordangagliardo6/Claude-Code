/**
 * Main workflow
 *
 * Orchestrates: Apollo search → duplicate filter → Google Sheets append.
 * Called by the scheduler (and by index.js for one-off runs).
 */

const { searchHVACLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { sendAlert } = require('./notifier');
const logger = require('./logger');

/**
 * Run one complete lead-gen cycle.
 *
 * Strategy:
 *  1. Ask Apollo for up to 2× the target count so we have headroom
 *     after duplicate filtering.
 *  2. Pass everything to appendLeads(), which does its own dedup
 *     against the sheet and writes at most maxLeads rows.
 *
 * @param {number} maxLeads  Maximum new rows to add this run (default: 25)
 */
async function runWorkflow(maxLeads = 25) {
  logger.separator();
  logger.info(`Workflow started — target: ${maxLeads} new leads`);

  let apolloLeads;
  try {
    // Fetch double the target to account for duplicates
    apolloLeads = await searchHVACLeads(maxLeads * 2, 1);
  } catch (err) {
    await sendAlert(
      'Apollo search failed',
      err.message
    );
    return { success: false, added: 0, error: err.message };
  }

  if (!apolloLeads.length) {
    const msg = 'Apollo returned zero results. Search filters may need adjustment or quota may be exhausted.';
    await sendAlert('Apollo returned no results', msg);
    return { success: false, added: 0, error: msg };
  }

  // Trim to the per-run cap before passing to Sheets
  // (appendLeads will still skip any that are duplicates)
  const candidates = apolloLeads.slice(0, maxLeads);

  let added;
  try {
    added = await appendLeads(candidates);
  } catch (err) {
    await sendAlert(
      'Google Sheets write failed',
      err.message
    );
    return { success: false, added: 0, error: err.message };
  }

  logger.success(`Workflow complete — ${added} new lead(s) added to spreadsheet`);
  logger.separator();
  return { success: true, added };
}

module.exports = { runWorkflow };
