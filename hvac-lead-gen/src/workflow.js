/**
 * Core workflow — runs one full lead generation cycle:
 * 1. Search Apollo.io for HVAC leads in Southwest Michigan
 * 2. Append new (non-duplicate) leads to Google Sheets
 * 3. Log results; notify on error
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { searchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { log, notifyError } = require('./notify');

async function runWorkflow() {
  const maxLeads = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

  log('info', `Starting HVAC lead generation run (max ${maxLeads} leads)`);

  // --- Step 1: Fetch leads from Apollo ---
  let leads;
  try {
    leads = await searchLeads(maxLeads);
  } catch (err) {
    await notifyError('Apollo.io search', err);
    return { success: false, step: 'apollo', error: err.message };
  }

  if (!leads || leads.length === 0) {
    const msg = 'Apollo returned zero results for this run.';
    log('warn', msg);
    await notifyError('Apollo.io search — no results', new Error(msg));
    return { success: false, step: 'apollo', error: msg };
  }

  log('info', `Apollo returned ${leads.length} leads before deduplication`);

  // --- Step 2: Write to Google Sheets ---
  let result;
  try {
    result = await appendLeads(leads);
  } catch (err) {
    await notifyError('Google Sheets write', err);
    return { success: false, step: 'sheets', error: err.message };
  }

  log(
    'info',
    `Run complete — Added: ${result.added} new leads, Skipped: ${result.skipped} duplicates`
  );

  return { success: true, ...result };
}

module.exports = { runWorkflow };
