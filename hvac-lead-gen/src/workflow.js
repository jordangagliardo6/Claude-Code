const { fetchLeads } = require('./apolloSearch');
const { appendLeads } = require('./sheetsManager');
const { notifyError, notifySuccess } = require('./notifier');
const { config } = require('./config');
const logger = require('./logger');

/**
 * Runs one full lead generation cycle:
 *  1. Fetch leads from Apollo.io
 *  2. Append new (non-duplicate) leads to Google Sheets
 *  3. Notify on error or log success
 */
async function runWorkflow() {
  const startTime = Date.now();
  logger.info('=== Workflow run started ===');

  let leads = [];

  // Step 1: Fetch from Apollo
  try {
    leads = await fetchLeads(config.workflow.maxLeadsPerRun);
  } catch (err) {
    const msg = `Apollo.io search failed: ${err.message}`;
    logger.error(msg);
    await notifyError('Apollo.io search', err);
    return { success: false, leadsAdded: 0, error: msg };
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned 0 qualified leads for this run';
    logger.warn(msg);
    await notifyError('Apollo returned no results', new Error(msg));
    return { success: false, leadsAdded: 0, error: msg };
  }

  logger.info(`Fetched ${leads.length} qualified lead(s) from Apollo`);

  // Step 2: Write to Google Sheets
  let leadsAdded = 0;
  try {
    leadsAdded = await appendLeads(leads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    logger.error(msg);
    await notifyError('Google Sheets write', err);
    return { success: false, leadsAdded: 0, error: msg };
  }

  // Step 3: Report success
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  await notifySuccess(leadsAdded);
  logger.info(`=== Workflow complete in ${elapsed}s — ${leadsAdded} new lead(s) added ===`);

  return { success: true, leadsAdded };
}

module.exports = { runWorkflow };
