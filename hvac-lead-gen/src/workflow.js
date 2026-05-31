/**
 * workflow.js — Core lead generation logic.
 *
 * Steps each run:
 *   1. Ensure the sheet has a header row
 *   2. Read existing business names from the sheet (for dedup)
 *   3. Search Apollo for HVAC contacts in SW Michigan
 *   4. Remove duplicates and leads without phone numbers
 *   5. Cap at maxLeadsPerRun and append to the sheet
 *   6. Notify on success or failure
 */

const config   = require('./config');
const apollo   = require('./apollo');
const sheets   = require('./sheets');
const { notifyError, notifySuccess } = require('./notify');

async function runLeadGenWorkflow() {
  const ts = new Date().toISOString();
  console.log(`\n[${ts}] ── Starting HVAC lead generation run ──`);

  try {
    // Step 1: Write headers if sheet is brand-new
    await sheets.ensureHeaderRow();

    // Step 2: Load existing business names so we can skip duplicates
    console.log('  Reading existing entries from Google Sheets...');
    const existingNames = await sheets.getExistingBusinessNames();
    console.log(`  ${existingNames.size} existing lead(s) found — dedup active.`);

    // Step 3: Fetch candidates from Apollo
    console.log('  Querying Apollo.io for HVAC leads in Southwest Michigan...');
    const candidates = await apollo.searchHvacLeads(config.maxLeadsPerRun * config.apolloFetchBuffer);
    console.log(`  Apollo returned ${candidates.length} candidate(s) with phone numbers.`);

    if (candidates.length === 0) {
      const reason =
        'Apollo returned 0 results. Possible causes: API limit reached, ' +
        'overly narrow filters, or no new contacts in the target area.';
      console.warn(`  WARNING: ${reason}`);
      await notifyError('No Apollo Results', reason);
      return;
    }

    // Step 4: Remove any business already in the sheet
    const newLeads = candidates.filter(lead => {
      const key = lead.businessName.toLowerCase().trim();
      return key.length > 0 && !existingNames.has(key);
    });

    const dupeCount = candidates.length - newLeads.length;
    if (dupeCount > 0) console.log(`  Removed ${dupeCount} duplicate(s).`);

    if (newLeads.length === 0) {
      console.log('  No new leads — every Apollo result is already in the sheet.');
      await notifySuccess(0, 0);
      return;
    }

    // Step 5: Honour the per-run cap
    const toAdd    = newLeads.slice(0, config.maxLeadsPerRun);
    const overflow = newLeads.length - toAdd.length;

    // Step 6: Write to Google Sheets
    console.log(`  Appending ${toAdd.length} new lead(s) to Google Sheets...`);
    await sheets.appendLeads(toAdd);

    console.log(`  ✓ Run complete — ${toAdd.length} lead(s) added.`);
    if (overflow > 0) console.log(`  (${overflow} additional lead(s) held back by the per-run cap — will appear on future runs.)`);

    await notifySuccess(toAdd.length, overflow);

  } catch (err) {
    // Attach any HTTP response body to the error message for easier debugging
    const detail = err.response
      ? `${err.message} — API body: ${JSON.stringify(err.response.data)}`
      : err.message;

    console.error(`  ✗ Run failed: ${detail}`);
    await notifyError('Lead Gen Run Failed', detail);
  }
}

module.exports = { runLeadGenWorkflow };
