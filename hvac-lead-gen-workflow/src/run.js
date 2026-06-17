// The actual workflow: search Apollo -> dedupe against the sheet -> append new leads.
// Can be run directly (`npm run run-once`) or invoked by the scheduler.
require('dotenv').config();
const config = require('../config');
const { findHvacLeads } = require('./apolloClient');
const {
  getSheetsClient,
  ensureHeaderRow,
  getExistingBusinessNames,
  appendLeads,
} = require('./sheetsClient');
const { notifyError } = require('./notify');

async function runWorkflow() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    await notifyError('Missing SPREADSHEET_ID', new Error('SPREADSHEET_ID is not set in the environment.'));
    return;
  }

  console.log(`[${new Date().toISOString()}] Starting HVAC lead gen run...`);

  let rawLeads;
  try {
    rawLeads = await findHvacLeads();
  } catch (err) {
    await notifyError('Apollo search/enrichment failed', err);
    return;
  }

  if (!rawLeads || rawLeads.length === 0) {
    await notifyError(
      'Apollo returned no results',
      new Error('No HVAC/plumbing/mechanical leads matched the configured filters this run.')
    );
    return;
  }

  try {
    const sheets = getSheetsClient();
    await ensureHeaderRow(sheets, spreadsheetId);
    const existingNames = await getExistingBusinessNames(sheets, spreadsheetId);

    const newLeads = rawLeads
      .filter((lead) => lead.businessName && !existingNames.has(lead.businessName.trim().toLowerCase()))
      .slice(0, config.maxNewLeadsPerRun);

    if (newLeads.length === 0) {
      console.log(
        `[${new Date().toISOString()}] No new leads added - all ${rawLeads.length} result(s) were already in the sheet.`
      );
      return;
    }

    await appendLeads(sheets, spreadsheetId, newLeads);
    console.log(`[${new Date().toISOString()}] Added ${newLeads.length} new lead(s) to the sheet.`);
  } catch (err) {
    await notifyError('Google Sheets write failed', err);
  }
}

module.exports = { runWorkflow };

if (require.main === module) {
  runWorkflow()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Unexpected error:', err);
      process.exit(1);
    });
}
