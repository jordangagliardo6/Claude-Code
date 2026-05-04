'use strict';

const { searchLeads } = require('./apolloService');
const { appendLeads } = require('./driveService');
const logger = require('./logger');
const { notifyError } = require('./logger');

const MAX_LEADS = Number(process.env.MAX_LEADS_PER_RUN) || 25;

/**
 * End-to-end workflow:
 *   1. Search Apollo.io for HVAC decision-makers in Southwest Michigan
 *   2. Deduplicate against existing sheet entries
 *   3. Append new leads to Google Sheets
 *
 * Returns { leadsFound, leadsAdded }.
 * On error: logs + sends alert email (if configured), then re-throws.
 */
async function runWorkflow() {
  const start = Date.now();
  logger.info('═══════════════════════════════════════════════════');
  logger.info('HVAC Lead Gen — Run Started');
  logger.info(`Max new leads this run: ${MAX_LEADS}`);
  logger.info('═══════════════════════════════════════════════════');

  let leadsFound = 0;
  let leadsAdded = 0;

  try {
    // ── Step 1: Apollo Search ──────────────────────────────────────────────
    const leads = await searchLeads(MAX_LEADS);
    leadsFound = leads.length;

    if (leadsFound === 0) {
      const msg =
        'Apollo returned 0 qualified leads. Check your API key, rate limits, ' +
        'or broaden the search filters in src/apolloService.js.';
      logger.warn(msg);
      await notifyError('Zero results from Apollo', msg);
      return { leadsFound: 0, leadsAdded: 0 };
    }

    // ── Step 2: Write to Google Sheets ────────────────────────────────────
    leadsAdded = await appendLeads(leads);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    logger.success(
      `Run complete in ${elapsed}s — found: ${leadsFound}, added: ${leadsAdded}`
    );
    logger.info('═══════════════════════════════════════════════════');

    return { leadsFound, leadsAdded };
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const message = `Workflow failed after ${elapsed}s: ${err.message}`;

    logger.error(message, { stack: err.stack });
    logger.info('═══════════════════════════════════════════════════');

    await notifyError(
      'Workflow Error',
      `${message}\n\nStack trace:\n${err.stack}`
    );

    throw err;
  }
}

module.exports = { runWorkflow };
