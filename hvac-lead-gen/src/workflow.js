'use strict';

const config = require('./config');
const { searchLeads } = require('./apolloService');
const { appendLeads } = require('./sheetsService');
const { notifyError, notifySuccess } = require('./notifier');

/**
 * Main workflow — called by the scheduler and by `npm run run-now`.
 * Returns a result summary object.
 */
async function runWorkflow() {
  const startTime = Date.now();
  console.log(`[workflow] Starting HVAC lead gen run — ${new Date().toISOString()}`);

  let leads = [];

  // ── Step 1: Pull leads from Apollo ────────────────────────────────────────
  try {
    leads = await searchLeads(config.MAX_LEADS_PER_RUN);
    console.log(`[workflow] Apollo returned ${leads.length} leads with phone numbers.`);
  } catch (err) {
    await notifyError('Apollo search failed', err);
    return { ok: false, stage: 'apollo', error: err.message };
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned zero results matching the search criteria.';
    console.warn(`[workflow] ${msg}`);
    await notifyError('Zero Apollo results', new Error(msg));
    return { ok: false, stage: 'apollo', error: msg };
  }

  // ── Step 2: Write to Google Sheets ────────────────────────────────────────
  let writeResult;
  try {
    writeResult = await appendLeads(leads);
    console.log(`[workflow] Sheet write complete — added: ${writeResult.added}, skipped: ${writeResult.skipped}`);
  } catch (err) {
    await notifyError('Google Sheets write failed', err);
    return { ok: false, stage: 'sheets', error: err.message };
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const result = {
    ok: true,
    totalFromApollo: leads.length,
    added: writeResult.added,
    skipped: writeResult.skipped,
    elapsedSeconds: elapsed,
  };

  await notifySuccess({ added: writeResult.added, skipped: writeResult.skipped, total: leads.length });

  console.log(`[workflow] Done in ${elapsed}s. Result:`, result);
  return result;
}

module.exports = { runWorkflow };
