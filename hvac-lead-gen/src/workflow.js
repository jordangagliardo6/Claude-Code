'use strict';

/**
 * Main workflow — can be run directly (`npm run run-now`) or called by the scheduler.
 */

require('dotenv').config();
const { fetchHVACLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { logInfo, logError, sendAlert } = require('./notify');

async function runLeadGeneration() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetName = process.env.SHEET_NAME || 'Sheet1';
  const maxLeads = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

  logInfo(`Starting lead generation run. Target: ${maxLeads} leads.`);

  // ── Step 1: Pull leads from Apollo ──────────────────────────────────────────
  let leads;
  try {
    leads = await fetchHVACLeads(maxLeads);
    logInfo(`Apollo returned ${leads.length} candidate lead(s).`);
  } catch (err) {
    const msg = `Apollo.io search failed: ${err.message}`;
    logError('Apollo search', err);
    await sendAlert('Apollo Search Failed', `${msg}\n\nCheck your APOLLO_API_KEY and retry.`);
    return { success: false, reason: msg };
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned 0 results. Check your filters or API key quota.';
    logError('Apollo search returned no results', new Error(msg));
    await sendAlert('No Apollo Results', msg);
    return { success: false, reason: msg };
  }

  // ── Step 2: Write to Google Sheets ──────────────────────────────────────────
  let written;
  try {
    written = await appendLeads(spreadsheetId, sheetName, leads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    logError('Sheets append', err);
    await sendAlert('Google Sheets Write Failed', `${msg}\n\nCheck your credentials and SPREADSHEET_ID.`);
    return { success: false, reason: msg };
  }

  const summary = `Run complete. ${written} new lead(s) added to sheet "${sheetName}".`;
  logInfo(summary);
  return { success: true, written, total: leads.length };
}

// Allow direct execution: `node src/workflow.js`
if (require.main === module) {
  runLeadGeneration()
    .then(result => {
      if (!result.success) process.exit(1);
    })
    .catch(err => {
      console.error('Unhandled error:', err);
      process.exit(1);
    });
}

module.exports = { runLeadGeneration };
