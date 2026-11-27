/**
 * Core workflow logic — called by both the cron scheduler and run-now.js.
 */

const { fetchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { notifyError } = require('./notify');

async function run() {
  const startTime = new Date().toISOString();
  console.log(`\n=== HVAC Lead Generator Run: ${startTime} ===`);

  let leads = [];

  // --- Step 1: Fetch from Apollo ---
  try {
    console.log('Fetching leads from Apollo.io...');
    leads = await fetchLeads();
    console.log(`Apollo returned ${leads.length} qualifying lead(s).`);
  } catch (err) {
    await notifyError(
      'Apollo.io fetch failed',
      `The workflow could not retrieve leads from Apollo.io.\n\nError: ${err.message}\n\nCheck your APOLLO_API_KEY and Apollo account status.`
    );
    return { success: false, stage: 'apollo', error: err.message };
  }

  if (leads.length === 0) {
    console.log('No leads returned by Apollo for today\'s search criteria. Nothing to append.');
    // Not an error — just log it, no notification needed unless desired
    return { success: true, added: 0, skipped: 0 };
  }

  // --- Step 2: Append to Google Sheets ---
  let result;
  try {
    console.log('Appending leads to Google Sheets...');
    result = await appendLeads(leads);
  } catch (err) {
    await notifyError(
      'Google Sheets write failed',
      `Fetched ${leads.length} lead(s) from Apollo but could not write to Google Sheets.\n\nError: ${err.message}\n\nCheck your GOOGLE_APPLICATION_CREDENTIALS and GOOGLE_SHEET_ID.`
    );
    return { success: false, stage: 'sheets', error: err.message };
  }

  console.log(`Done. Added: ${result.added} new lead(s), Skipped: ${result.skipped} duplicate(s).`);
  console.log(`=== Run complete ===\n`);

  return { success: true, ...result };
}

module.exports = { run };
