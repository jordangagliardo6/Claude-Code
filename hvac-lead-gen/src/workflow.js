const { searchLeads } = require('./apollo');
const { appendLeads } = require('./googleDrive');
const { sendAlert } = require('./alerts');
const config = require('./config');

/**
 * Main workflow: search Apollo for leads, then write new ones to Google Sheets.
 * Call this once manually or let the scheduler call it every morning.
 */
async function runWorkflow() {
  const startTime = new Date();
  console.log(`\n[Workflow] Starting lead generation run at ${startTime.toISOString()}`);

  let leads = [];
  let appended = 0;

  // Step 1: Pull leads from Apollo
  try {
    leads = await searchLeads(config.scheduler.maxLeadsPerRun);
  } catch (err) {
    await sendAlert(
      'Apollo Search Failed',
      `The Apollo.io search encountered an error:\n${err.message}\n\nStack:\n${err.stack}`
    );
    return { success: false, stage: 'apollo', error: err.message };
  }

  if (leads.length === 0) {
    await sendAlert(
      'Apollo Returned No Results',
      'The Apollo.io search completed but returned 0 results for Southwest Michigan HVAC companies. ' +
      'This may indicate a filter issue or an API quota limit. ' +
      'Please check the Apollo dashboard and verify your API key is active.'
    );
    return { success: false, stage: 'apollo', error: 'No results returned' };
  }

  console.log(`[Workflow] ${leads.length} leads fetched from Apollo.`);

  // Step 2: Write leads to Google Sheets
  try {
    appended = await appendLeads(leads);
  } catch (err) {
    await sendAlert(
      'Google Sheets Write Failed',
      `${leads.length} leads were fetched from Apollo but could not be written to Google Sheets:\n${err.message}\n\nStack:\n${err.stack}`
    );
    return { success: false, stage: 'sheets', error: err.message };
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[Workflow] Done. ${appended} new lead(s) added to the spreadsheet. ` +
    `(${leads.length - appended} duplicate(s) skipped) — ${elapsed}s`
  );

  return { success: true, fetched: leads.length, appended };
}

module.exports = { runWorkflow };
