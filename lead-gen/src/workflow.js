/**
 * workflow.js — Orchestrates one complete lead-generation run.
 *
 * 1. Fetch leads from Apollo.io
 * 2. Append new leads to Google Sheets (skip duplicates)
 * 3. Report results / alert on failure
 */

const { fetchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { alertError } = require('./notify');

async function runWorkflow() {
  const {
    APOLLO_API_KEY,
    GOOGLE_SPREADSHEET_ID,
    GOOGLE_SHEET_NAME = 'Sheet1',
    GOOGLE_SERVICE_ACCOUNT_PATH = './credentials/service-account.json',
    MAX_LEADS_PER_RUN = '25',
  } = process.env;

  const maxLeads = Math.min(parseInt(MAX_LEADS_PER_RUN, 10) || 25, 100);

  console.log(`\n[${new Date().toISOString()}] Starting lead-gen run (max ${maxLeads} leads)`);

  // ── Step 1: Apollo search ─────────────────────────────────────────────────
  let leads;
  try {
    leads = await fetchLeads(APOLLO_API_KEY, maxLeads);
    console.log(`  Apollo returned ${leads.length} qualified leads`);
  } catch (err) {
    await alertError('Apollo search failed', err);
    return;
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned 0 qualified leads for Southwest Michigan HVAC — check filters or API quota.';
    await alertError('No leads returned', msg);
    return;
  }

  // ── Step 2: Write to Google Sheets ────────────────────────────────────────
  let result;
  try {
    result = await appendLeads({
      serviceAccountPath: GOOGLE_SERVICE_ACCOUNT_PATH,
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      sheetName: GOOGLE_SHEET_NAME,
      leads,
    });
  } catch (err) {
    await alertError('Google Sheets write failed', err);
    return;
  }

  console.log(`  Added: ${result.added}  |  Skipped (duplicates): ${result.skipped}`);
  console.log(`[${new Date().toISOString()}] Run complete.\n`);
}

module.exports = { runWorkflow };
