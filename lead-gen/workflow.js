/**
 * workflow.js
 * Orchestrates one full lead generation run:
 *   1. Fetch leads from Apollo.io
 *   2. De-duplicate against the existing Google Sheet
 *   3. Append new leads
 *   4. Log results (and notify on error)
 *
 * Can be run directly: node workflow.js
 */

const { fetchLeads } = require('./apollo');
const { getClient, ensureHeaders, getExistingBusinessNames, appendLeads } = require('./sheets');
const { notifyError } = require('./notify');

async function run() {
  const startedAt = new Date().toISOString();
  console.log(`\n[${startedAt}] Starting HVAC lead generation run...`);

  let sheets;
  try {
    sheets = await getClient();
    console.log('  Google Sheets: connected.');
  } catch (err) {
    const msg = `Google Sheets connection failed: ${err.message}`;
    console.error(`  ERROR: ${msg}`);
    await notifyError(msg);
    return;
  }

  // Make sure the header row is present
  try {
    await ensureHeaders(sheets);
  } catch (err) {
    const msg = `Failed to ensure sheet headers: ${err.message}`;
    console.error(`  ERROR: ${msg}`);
    await notifyError(msg);
    return;
  }

  // Load existing business names to guard against duplicates
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    console.log(`  Found ${existingNames.size} existing leads in sheet.`);
  } catch (err) {
    const msg = `Failed to read existing sheet data: ${err.message}`;
    console.error(`  ERROR: ${msg}`);
    await notifyError(msg);
    return;
  }

  // Pull fresh leads from Apollo
  let leads;
  try {
    console.log('  Querying Apollo.io...');
    leads = await fetchLeads();
    console.log(`  Apollo returned ${leads.length} candidate lead(s).`);
  } catch (err) {
    const msg = `Apollo.io search failed: ${err.message}`;
    console.error(`  ERROR: ${msg}`);
    await notifyError(msg);
    return;
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned no results for this run. Nothing to write.';
    console.warn(`  WARNING: ${msg}`);
    await notifyError(msg); // worth a heads-up since it may indicate a config issue
    return;
  }

  // Write new leads to the sheet
  let written;
  try {
    written = await appendLeads(sheets, leads, existingNames);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    console.error(`  ERROR: ${msg}`);
    await notifyError(msg);
    return;
  }

  const skipped = leads.length - written;
  console.log(`  Done. Wrote ${written} new lead(s), skipped ${skipped} duplicate(s).`);
  console.log(`[${new Date().toISOString()}] Run complete.\n`);
}

// Allow direct execution: node workflow.js
if (require.main === module) {
  run().catch((err) => {
    console.error('Unhandled error in workflow:', err);
    process.exit(1);
  });
}

module.exports = { run };
