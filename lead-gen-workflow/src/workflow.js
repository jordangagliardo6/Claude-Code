/**
 * Core workflow: pull leads from Apollo → deduplicate → append to Google Sheets.
 * Called by the cron scheduler in index.js on every scheduled run.
 */

'use strict';

const { searchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { sendNotification } = require('./notify');

const MAX_LEADS = () => parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

async function runWorkflow() {
  const ts = () => new Date().toISOString();

  console.log(`\n[${ts()}] ── Workflow started ─────────────────────────────`);

  // ── Step 1: Fetch leads from Apollo ────────────────────────────────────────
  let leads;
  try {
    console.log(`[${ts()}] Searching Apollo.io for HVAC leads in Southwest Michigan...`);
    leads = await searchLeads(MAX_LEADS());
    console.log(`[${ts()}] Apollo returned ${leads.length} lead(s) with phone numbers.`);
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    console.error(`[${ts()}] ERROR: ${msg}`);
    await sendNotification('Apollo Search Failed', msg);
    return { success: false, error: msg };
  }

  if (leads.length === 0) {
    const msg =
      'Apollo returned 0 results with phone numbers. ' +
      'Verify your API key, filters, and Apollo plan allow people search.';
    console.warn(`[${ts()}] WARNING: ${msg}`);
    await sendNotification('No Leads Returned', msg);
    return { success: true, added: 0, skipped: 0 };
  }

  // ── Step 2: Append to Google Sheets ────────────────────────────────────────
  let result;
  try {
    console.log(`[${ts()}] Writing leads to Google Sheet...`);
    result = await appendLeads(leads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    console.error(`[${ts()}] ERROR: ${msg}`);
    await sendNotification('Google Sheets Write Failed', msg);
    return { success: false, error: msg };
  }

  console.log(
    `[${ts()}] ── Workflow complete — Added: ${result.added} | Duplicates skipped: ${result.skipped} ──`
  );

  return { success: true, ...result };
}

module.exports = { runWorkflow };
