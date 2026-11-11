const { searchLeads } = require('./apollo');
const {
  ensureSpreadsheet,
  getExistingBusinessNames,
  appendLeads,
} = require('./sheets');
const { sendErrorNotification, logSuccess } = require('./notify');

/**
 * Main workflow: search Apollo, dedup against sheet, append new leads.
 * This is the function called by both the scheduler and direct runs.
 */
async function runWorkflow() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Workflow] Starting HVAC lead generation run`);
  console.log(`[Workflow] ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} (Eastern)`);
  console.log(`${'='.repeat(60)}`);

  let sheetId;

  // Step 1: Ensure the spreadsheet exists
  try {
    sheetId = await ensureSpreadsheet();
  } catch (err) {
    await sendErrorNotification(
      'Google Drive connection failed',
      `Could not access or create the spreadsheet.\n\nError: ${err.message}\n\n` +
        'Check your GOOGLE_CREDENTIALS_PATH and that the service account has access to the sheet.'
    );
    return { success: false, error: err.message };
  }

  // Step 2: Fetch existing business names to prevent duplicates
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheetId);
  } catch (err) {
    await sendErrorNotification(
      'Google Sheets read failed',
      `Could not read existing leads from the spreadsheet.\n\nSheet ID: ${sheetId}\nError: ${err.message}`
    );
    return { success: false, error: err.message };
  }

  // Step 3: Search Apollo.io for new leads
  let rawLeads;
  try {
    rawLeads = await searchLeads();
  } catch (err) {
    await sendErrorNotification(
      'Apollo.io search failed',
      `The Apollo search returned an error.\n\nError: ${err.message}\n\n` +
        'Check your APOLLO_API_KEY and Apollo account status.'
    );
    return { success: false, error: err.message };
  }

  if (rawLeads.length === 0) {
    await sendErrorNotification(
      'Apollo.io returned zero results',
      'The search completed but returned no HVAC leads in Southwest Michigan.\n\n' +
        'Possible causes:\n' +
        '- Apollo API key has no search credits remaining\n' +
        '- The industry/location filter returned no matches\n' +
        '- Try broadening the city list or industry keywords in src/config.js'
    );
    return { success: false, error: 'No leads returned from Apollo' };
  }

  // Step 4: Filter out duplicates
  const newLeads = rawLeads.filter(
    (lead) => !existingNames.has(lead.businessName.toLowerCase().trim())
  );
  const skippedCount = rawLeads.length - newLeads.length;

  console.log(`[Workflow] New: ${newLeads.length}, Duplicates skipped: ${skippedCount}`);

  if (newLeads.length === 0) {
    console.log('[Workflow] All returned leads are already in the sheet. Nothing to append.');
    logSuccess(0, skippedCount);
    return { success: true, added: 0, skipped: skippedCount };
  }

  // Step 5: Append new leads to sheet
  try {
    await appendLeads(sheetId, newLeads);
  } catch (err) {
    await sendErrorNotification(
      'Google Sheets write failed',
      `Fetched ${newLeads.length} new leads from Apollo but failed to write them to the sheet.\n\n` +
        `Sheet ID: ${sheetId}\nError: ${err.message}`
    );
    return { success: false, error: err.message };
  }

  logSuccess(newLeads.length, skippedCount);
  return { success: true, added: newLeads.length, skipped: skippedCount };
}

module.exports = { runWorkflow };
