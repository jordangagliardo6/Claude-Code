/**
 * Core workflow — ties Apollo search → duplicate check → Sheet append together.
 */

const { searchLeads } = require('./apolloClient');
const { appendLeads } = require('./sheetsClient');
const { sendErrorAlert } = require('./notifier');
const logger = require('./logger');

/**
 * Run one lead generation cycle.
 *
 * @returns {Promise<{fetched: number, added: number, skipped: number}>}
 */
async function run() {
  const maxLeads = Number(process.env.MAX_LEADS_PER_RUN) || 25;
  logger.info(`=== Lead generation run started (max ${maxLeads} leads) ===`);

  let leads = [];

  // ── Step 1: Fetch from Apollo ───────────────────────────────────────────────
  try {
    leads = await searchLeads({ maxResults: maxLeads });

    if (leads.length === 0) {
      const msg = 'Apollo returned 0 usable leads for this run.';
      logger.warn(msg);
      await sendErrorAlert('No results from Apollo', msg);
      return { fetched: 0, added: 0, skipped: 0 };
    }

    logger.info(`Fetched ${leads.length} leads from Apollo`);
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    logger.error(msg, err);
    await sendErrorAlert('Apollo search failed', msg);
    throw err; // rethrow so the scheduler knows the run failed
  }

  // ── Step 2: Write to Google Sheets ──────────────────────────────────────────
  let added = 0;
  try {
    added = await appendLeads(leads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    logger.error(msg, err);
    await sendErrorAlert('Google Sheets write failed', `${msg}\n\nLeads that were NOT saved:\n${JSON.stringify(leads, null, 2)}`);
    throw err;
  }

  const skipped = leads.length - added;
  logger.success(`=== Run complete: ${added} added, ${skipped} skipped (duplicates) ===`);
  return { fetched: leads.length, added, skipped };
}

module.exports = { run };
