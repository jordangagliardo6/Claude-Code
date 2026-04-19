require('dotenv').config();
const { fetchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { log, sendAlert } = require('./logger');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

async function runWorkflow() {
  const startTime = Date.now();
  log.info('=== Lead Generation Workflow Starting ===');

  let apolloLeads = [];
  let result = { added: 0, skipped: 0 };

  // Step 1: Fetch leads from Apollo
  try {
    apolloLeads = await fetchLeads(MAX_LEADS);

    if (apolloLeads.length === 0) {
      const msg = 'Apollo returned 0 results for HVAC / Southwest Michigan search. No leads to add.';
      log.warn(msg);
      await sendAlert('No Apollo Results', msg);
      return { added: 0, skipped: 0, error: null };
    }
  } catch (err) {
    const msg = `Apollo search failed: ${err.response?.data?.message || err.message}`;
    log.error(msg);
    await sendAlert('Apollo API Error', msg);
    throw err;
  }

  // Step 2: Write to Google Sheets
  try {
    result = await appendLeads(apolloLeads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    log.error(msg);
    await sendAlert('Google Sheets Error', msg);
    throw err;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.info(`=== Workflow Complete: ${result.added} added, ${result.skipped} skipped (${elapsed}s) ===`);

  return { ...result, error: null };
}

module.exports = { runWorkflow };
