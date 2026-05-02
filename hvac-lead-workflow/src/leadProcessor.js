/**
 * leadProcessor.js
 *
 * Orchestrates a single workflow run:
 *   1. Fetch candidates from Apollo.io (paginating if necessary)
 *   2. De-duplicate against names already in the spreadsheet
 *   3. Append new leads to Google Sheets
 *   4. Return a run summary
 *
 * The loop continues fetching pages from Apollo until we have enough NEW
 * leads to meet MAX_LEADS_PER_RUN, or Apollo has no more results.
 */

const { searchHVACLeads } = require('./apolloClient');
const { getExistingBusinessNames, ensureHeader, appendLeads } = require('./sheetsClient');

const DEFAULT_MAX_LEADS = 25;
const APOLLO_PAGE_SIZE  = 50; // fetch 50 at a time to minimise API calls

/**
 * Run a full lead generation cycle.
 *
 * @returns {{ addedCount: number, skippedCount: number, totalFetched: number }}
 */
async function runLeadWorkflow() {
  const maxLeads = parseInt(process.env.MAX_LEADS_PER_RUN, 10) || DEFAULT_MAX_LEADS;

  // Step 1: load existing business names for duplicate checking.
  console.log('  → Loading existing leads from Google Sheets…');
  await ensureHeader();
  const existingNames = await getExistingBusinessNames();
  console.log(`     ${existingNames.size} existing business(es) found in spreadsheet.`);

  const newLeads    = [];
  let totalFetched  = 0;
  let skippedCount  = 0;
  let page          = 1;

  // Step 2: fetch pages from Apollo until we have enough unique new leads.
  while (newLeads.length < maxLeads) {
    console.log(`  → Fetching Apollo page ${page}…`);
    const { leads, totalAvailable } = await searchHVACLeads(page, APOLLO_PAGE_SIZE);

    if (leads.length === 0) {
      console.log('     Apollo returned no more results.');
      break;
    }

    totalFetched += leads.length;

    for (const lead of leads) {
      if (newLeads.length >= maxLeads) break;

      // Skip leads with no business name (can't dedup or identify them).
      if (!lead.businessName) {
        skippedCount++;
        continue;
      }

      const key = lead.businessName.toLowerCase().trim();
      if (existingNames.has(key)) {
        skippedCount++;
        continue;
      }

      // Mark as seen so we don't add the same company twice in one run
      // (Apollo can return the same org via different contacts).
      existingNames.add(key);
      newLeads.push(lead);
    }

    // Stop if Apollo has no more pages.
    if (totalFetched >= totalAvailable) break;

    page++;
  }

  // Step 3: write new leads to the sheet.
  if (newLeads.length > 0) {
    console.log(`  → Appending ${newLeads.length} new lead(s) to Google Sheets…`);
    await appendLeads(newLeads);
  } else {
    console.log('  → No new leads to add this run.');
  }

  return {
    addedCount:   newLeads.length,
    skippedCount,
    totalFetched,
  };
}

module.exports = { runLeadWorkflow };
