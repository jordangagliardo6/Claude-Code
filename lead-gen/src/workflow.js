const { searchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { sendAlert } = require('./notify');
const { apollo } = require('./config');

/**
 * The core workflow: pull leads from Apollo and append them to Google Sheets.
 * Returns a summary object. Throws only on configuration errors;
 * runtime errors are caught, logged, and trigger an alert.
 */
async function runWorkflow() {
  const startedAt = new Date().toISOString();
  console.log(`\n========================================`);
  console.log(`Lead gen run started at ${startedAt}`);
  console.log(`========================================`);

  let leads = [];
  let added = 0;

  // --- Step 1: Search Apollo ---
  try {
    console.log(`Searching Apollo for up to ${apollo.maxLeadsPerRun} HVAC leads in SW Michigan…`);
    leads = await searchLeads(apollo.maxLeadsPerRun);
    console.log(`Apollo returned ${leads.length} qualifying lead(s).`);
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    await sendAlert('Apollo search failed', `${msg}\n\nStarted at: ${startedAt}`);
    return { startedAt, apolloLeads: 0, added: 0, error: msg };
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned 0 results matching the filters. No leads added.';
    await sendAlert('Apollo returned 0 results', `${msg}\n\nStarted at: ${startedAt}`);
    return { startedAt, apolloLeads: 0, added: 0, error: msg };
  }

  // --- Step 2: Write to Google Sheets ---
  try {
    added = await appendLeads(leads);
    console.log(`Added ${added} new lead(s) to the spreadsheet.`);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    await sendAlert('Google Sheets write failed', `${msg}\n\nStarted at: ${startedAt}\nLeads fetched but not saved: ${leads.length}`);
    return { startedAt, apolloLeads: leads.length, added: 0, error: msg };
  }

  const summary = { startedAt, apolloLeads: leads.length, added, error: null };
  console.log(`Run complete. Summary: ${JSON.stringify(summary)}`);
  return summary;
}

module.exports = { runWorkflow };
