/**
 * Core workflow logic — called by the scheduler on each cron tick
 * and also exported so test-connection.js can invoke it directly.
 */

require('dotenv').config();

const { searchHVACLeads } = require('./apollo');
const { getExistingBusinessNames, ensureHeaderRow, appendLeads } = require('./sheets');
const { sendErrorAlert } = require('./notify');

async function runWorkflow() {
  const runId = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Workflow] Starting run at ${runId}`);
  console.log(`${'='.repeat(60)}`);

  let leads = [];

  // ── Step 1: Pull leads from Apollo ───────────────────────────
  try {
    leads = await searchHVACLeads();
  } catch (err) {
    await sendErrorAlert(
      'Apollo.io search failed',
      `Run: ${runId}\nError: ${err.message}\n\nCheck APOLLO_API_KEY and your Apollo account status.`
    );
    return { success: false, step: 'apollo', error: err.message };
  }

  if (leads.length === 0) {
    await sendErrorAlert(
      'Apollo returned 0 results',
      `Run: ${runId}\n\nApollo search returned no HVAC leads for Southwest Michigan.\n` +
      'Possible causes:\n' +
      '  • Your Apollo plan has hit its monthly limit\n' +
      '  • The city/industry filters are too narrow\n' +
      '  • Apollo has no fresh contacts matching the criteria\n'
    );
    return { success: false, step: 'apollo', error: 'No results returned' };
  }

  // ── Step 2: Check for duplicates ─────────────────────────────
  let existingNames;
  try {
    await ensureHeaderRow();
    existingNames = await getExistingBusinessNames();
  } catch (err) {
    await sendErrorAlert(
      'Google Sheets read failed',
      `Run: ${runId}\nError: ${err.message}\n\n` +
      'Check:\n' +
      '  • GOOGLE_SHEET_ID is correct\n' +
      '  • Service account JSON key path is correct\n' +
      '  • The spreadsheet is shared with the service account email\n'
    );
    return { success: false, step: 'sheets-read', error: err.message };
  }

  // ── Step 3: Write new leads ───────────────────────────────────
  let appended = 0;
  try {
    appended = await appendLeads(leads, existingNames);
  } catch (err) {
    await sendErrorAlert(
      'Google Sheets write failed',
      `Run: ${runId}\nError: ${err.message}\n\nLeads fetched but not written. Check Sheets API quota and permissions.`
    );
    return { success: false, step: 'sheets-write', error: err.message };
  }

  console.log(`\n[Workflow] Run complete. ${appended} new lead(s) added to sheet.`);
  return { success: true, fetched: leads.length, appended };
}

module.exports = { runWorkflow };
