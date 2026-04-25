const config = require('./config');
const logger = require('./logger');
const apollo = require('./apollo');
const sheets = require('./sheets');

/**
 * Main workflow — runs one complete lead generation cycle:
 *   1. Fetch leads from Apollo
 *   2. Read existing sheet data for deduplication
 *   3. Filter out duplicates
 *   4. Append new leads to the spreadsheet
 *
 * Structured so any step can throw and the caller (scheduler or run-now script)
 * handles the error with an alert.
 */
async function runWorkflow() {
  const startTime = Date.now();
  logger.info('=== Lead generation run started ===');

  // Step 1 — Fetch leads from Apollo
  logger.info('Step 1/3: Fetching leads from Apollo.io...');
  const leads = await apollo.fetchLeads();

  if (leads.length === 0) {
    logger.alert(
      'Apollo returned zero usable leads this run. ' +
      'The search filters may be too narrow or the API quota may be exhausted. ' +
      `Check your Apollo account or expand the city list in src/config.js. Alert: ${config.alertEmail}`
    );
    return { added: 0, skipped: 0, total: 0 };
  }

  // Step 2 — Load existing business names to deduplicate
  logger.info('Step 2/3: Checking spreadsheet for existing entries...');
  await sheets.ensureHeaders();
  const existingNames = await sheets.getExistingBusinessNames();
  logger.info(`Found ${existingNames.size} existing businesses in sheet`);

  // Step 3 — Filter duplicates and build rows
  logger.info('Step 3/3: Filtering duplicates and writing new leads...');

  const newRows = [];
  const skipped = [];

  for (const lead of leads) {
    const normalized = lead.businessName.toLowerCase();

    if (existingNames.has(normalized)) {
      skipped.push(lead.businessName);
      continue;
    }

    // Mark as seen so we don't add two entries from the same run
    existingNames.add(normalized);
    newRows.push(sheets.leadToRow(lead));
  }

  if (skipped.length > 0) {
    logger.info(`Skipped ${skipped.length} duplicate(s): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '...' : ''}`);
  }

  // Respect the per-run cap even after dedup (leads list is already capped by Apollo query,
  // but this is a safety net in case dedup removes fewer than expected)
  const rowsToWrite = newRows.slice(0, config.maxLeadsPerRun);

  if (rowsToWrite.length === 0) {
    logger.info('No new leads to add — all results were duplicates or filtered out.');
    logSummary(startTime, 0, skipped.length, leads.length);
    return { added: 0, skipped: skipped.length, total: leads.length };
  }

  const added = await sheets.appendRows(rowsToWrite);
  logSummary(startTime, added, skipped.length, leads.length);

  return { added, skipped: skipped.length, total: leads.length };
}

function logSummary(startTime, added, skipped, total) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(
    `=== Run complete in ${elapsed}s — ` +
    `Added: ${added} | Skipped (duplicates): ${skipped} | Total from Apollo: ${total} ===`
  );
}

module.exports = { runWorkflow };
