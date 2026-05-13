/**
 * Core workflow — runs one full lead-generation cycle.
 * Called by the scheduler (index.js) or directly via --run-now.
 */

const { searchHVACLeads } = require('./apollo');
const { appendLeads }     = require('./sheets');
const { notifyError }     = require('./notifier');
const logger              = require('./logger');

async function runWorkflow() {
  const maxLeads = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
  const startedAt = new Date().toISOString();

  logger.info('────────────────────────────────────────────────────');
  logger.info(`LEAD GEN WORKFLOW STARTED at ${startedAt}`);
  logger.info(`Max leads this run: ${maxLeads}`);
  logger.info('────────────────────────────────────────────────────');

  let leads = [];

  // ── Step 1: Pull leads from Apollo ───────────────────────────────────────
  try {
    leads = await searchHVACLeads(maxLeads);
  } catch (err) {
    await notifyError(
      'Apollo.io search failed',
      `The Apollo API returned an error and no leads were fetched.\n\nDetails: ${err.message}\nStack: ${err.stack}`
    );
    return { success: false, stage: 'apollo', error: err.message };
  }

  if (leads.length === 0) {
    await notifyError(
      'Apollo.io returned 0 results',
      'The search completed successfully but no contacts matched the city/industry filters. ' +
      'Check the Apollo filters in src/apollo.js or verify your API key has search access.'
    );
    return { success: false, stage: 'apollo', error: 'zero results' };
  }

  // ── Step 2: Write to Google Sheets ───────────────────────────────────────
  let written = 0;
  try {
    written = await appendLeads(leads);
  } catch (err) {
    await notifyError(
      'Google Sheets write failed',
      `Fetched ${leads.length} leads from Apollo but could not write to the spreadsheet.\n\nDetails: ${err.message}\nStack: ${err.stack}`
    );
    return { success: false, stage: 'sheets', error: err.message };
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  const finishedAt = new Date().toISOString();
  logger.info('────────────────────────────────────────────────────');
  logger.info(`WORKFLOW COMPLETE at ${finishedAt}`);
  logger.info(`  Fetched from Apollo : ${leads.length}`);
  logger.info(`  New rows written    : ${written}`);
  logger.info(`  Skipped (duplicate) : ${leads.length - written}`);
  logger.info('────────────────────────────────────────────────────');

  return { success: true, fetched: leads.length, written };
}

module.exports = { runWorkflow };
