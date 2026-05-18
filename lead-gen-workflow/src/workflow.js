'use strict';

const config = require('./config');
const logger = require('./logger');
const apollo = require('./apollo');
const sheets = require('./sheets');

/**
 * Main workflow function. Called by the scheduler every morning at 7am ET
 * and can also be triggered manually via `npm run run-now`.
 *
 * @returns {{ added: number, skipped: number, error: string|null }}
 */
async function runWorkflow() {
  logger.info('═══ Lead-gen workflow starting ═══');
  const result = { added: 0, skipped: 0, error: null };

  try {
    // ── Step 1: Load existing business names from the sheet ──────────────────
    let knownNames;
    try {
      knownNames = await sheets.getExistingBusinessNames();
    } catch (err) {
      throw new Error(`Could not read Google Sheet (check credentials/spreadsheet ID): ${err.message}`);
    }

    const originalSize = knownNames.size;

    // ── Step 2: Fetch new leads from Apollo ──────────────────────────────────
    let newLeads;
    try {
      newLeads = await apollo.fetchNewLeads(config.MAX_LEADS_PER_RUN, knownNames);
    } catch (err) {
      throw new Error(`Apollo search failed: ${err.message}`);
    }

    result.skipped = knownNames.size - originalSize - newLeads.length; // duplicates filtered out

    if (newLeads.length === 0) {
      logger.warn('Apollo returned 0 new leads that match all criteria. Nothing to write.');
      logger.info('═══ Workflow complete — 0 leads added ═══\n');
      return result;
    }

    // ── Step 3: Write to Google Sheet ────────────────────────────────────────
    try {
      result.added = await sheets.appendLeads(newLeads);
    } catch (err) {
      throw new Error(`Google Sheets write failed: ${err.message}`);
    }

    logger.success(`Workflow complete — ${result.added} lead(s) added, ${result.skipped} duplicate(s) skipped.`);
    logger.info('═══ Workflow complete ═══\n');
    return result;

  } catch (err) {
    result.error = err.message;
    logger.error('Workflow failed', err);

    await logger.notify(
      'Workflow error — manual check needed',
      `The HVAC lead-gen workflow encountered an error at ${new Date().toISOString()}.\n\n` +
      `Error: ${err.message}\n\n` +
      `Check logs/workflow.log for the full trace.\n`
    );

    logger.info('═══ Workflow complete (with error) ═══\n');
    return result;
  }
}

module.exports = { runWorkflow };
