/**
 * workflow.js
 * Core orchestration logic — runs one full lead-gen pass.
 *
 * This module is intentionally kept separate from the scheduler so you can
 * call runWorkflow() from tests, the CLI (run-once.js), or the cron job
 * without any coupling to how it was triggered.
 */

const { searchLeads } = require('./apollo');
const { appendLeads }  = require('./sheets');
const { logger, notifyError, notifySuccess } = require('./notifier');

/**
 * runWorkflow
 * Orchestrates the full pipeline: Apollo search → deduplicate → append to sheet.
 *
 * @param {Object} [options]
 * @param {number} [options.maxLeads=25]  – cap on leads per run
 * @returns {Promise<{ inserted: number, skipped: number, error?: string }>}
 */
async function runWorkflow(options = {}) {
  const maxLeads = options.maxLeads ?? parseInt(process.env.MAX_LEADS_PER_RUN, 10) || 25;

  logger.info('─────────────────────────────────────────');
  logger.info(`Starting lead-gen run (max ${maxLeads} leads)`);
  logger.info('─────────────────────────────────────────');

  // ── Step 1: Search Apollo ──────────────────────────────────────────────────
  let leads;
  try {
    logger.info('Querying Apollo.io for HVAC leads in SW Michigan…');
    leads = await searchLeads(maxLeads);
    logger.info(`Apollo returned ${leads.length} candidate lead(s).`);
  } catch (err) {
    await notifyError('Apollo search failed', err, { maxLeads });
    return { inserted: 0, skipped: 0, error: err.message };
  }

  if (leads.length === 0) {
    await notifyError(
      'Apollo returned zero results',
      new Error(
        'Apollo.io returned no leads for the configured cities and filters. ' +
        'Check CITY_LIST, INDUSTRIES, and your Apollo plan limits.'
      ),
      { maxLeads }
    );
    return { inserted: 0, skipped: 0, error: 'No results from Apollo' };
  }

  // ── Step 2: Append to Google Sheets ───────────────────────────────────────
  let stats;
  try {
    logger.info(`Writing ${leads.length} lead(s) to Google Sheets (duplicates will be skipped)…`);
    stats = await appendLeads(leads);
  } catch (err) {
    await notifyError('Google Sheets write failed', err, {
      leadsAttempted: leads.length,
    });
    return { inserted: 0, skipped: 0, error: err.message };
  }

  // ── Step 3: Log success ───────────────────────────────────────────────────
  notifySuccess(stats);
  return stats;
}

module.exports = { runWorkflow };
