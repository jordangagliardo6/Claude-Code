const apollo  = require('./apollo');
const sheets  = require('./sheets');
const logger  = require('./logger');
const { sendErrorNotification } = require('./notify');

/**
 * Main workflow:
 *   1. Ensure the spreadsheet has headers
 *   2. Load existing business names (duplicate guard)
 *   3. Fetch leads from Apollo
 *   4. Filter duplicates
 *   5. Append new leads to Google Sheets
 *
 * @param {number} maxLeads  Max new rows to add this run (default: 25)
 */
async function runWorkflow(maxLeads = 25) {
  logger.info('══════════════════════════════════════════════');
  logger.info(`HVAC Lead Gen — starting run (max ${maxLeads} leads)`);
  logger.info('══════════════════════════════════════════════');

  // ── Step 1: ensure spreadsheet headers exist ────────────────────────────────
  try {
    await sheets.ensureHeaders();
  } catch (err) {
    const msg = 'Could not verify/write spreadsheet headers';
    await sendErrorNotification('Google Sheets Header Error', `${msg}: ${err.message}`);
    return;
  }

  // ── Step 2: load existing business names ────────────────────────────────────
  let existingNames;
  try {
    existingNames = await sheets.getExistingBusinessNames();
  } catch (err) {
    const msg = 'Failed to read existing leads from Google Sheets';
    await sendErrorNotification('Google Sheets Read Error', `${msg}: ${err.message}`);
    return;
  }

  // ── Step 3: fetch from Apollo (over-fetch to absorb duplicates) ─────────────
  let apolloLeads;
  try {
    // Request 3× the limit so we still hit maxLeads after duplicate removal
    apolloLeads = await apollo.fetchLeads(maxLeads * 3);
  } catch (err) {
    const msg = 'Failed to fetch leads from Apollo.io';
    await sendErrorNotification('Apollo.io API Error', `${msg}: ${err.message}`);
    return;
  }

  if (!apolloLeads || apolloLeads.length === 0) {
    const msg = 'Apollo returned zero results — check your API key and search filters';
    logger.warn(msg);
    await sendErrorNotification('Apollo No Results', msg);
    return;
  }

  // ── Step 4: remove duplicates ───────────────────────────────────────────────
  const newLeads = apolloLeads.filter(lead => {
    return !existingNames.has(lead.businessName.toLowerCase().trim());
  });

  const dupeCount = apolloLeads.length - newLeads.length;
  logger.info(`Deduplication: ${newLeads.length} new, ${dupeCount} already in sheet`);

  if (newLeads.length === 0) {
    logger.info('Nothing to add — all returned leads already exist in the spreadsheet');
    return;
  }

  // ── Step 5: append to Google Sheets ─────────────────────────────────────────
  const batch = newLeads.slice(0, maxLeads);
  logger.info(`Writing ${batch.length} new leads to spreadsheet...`);

  try {
    const added = await sheets.appendLeads(batch);
    logger.info(`══ Done — ${added} new leads added ══`);
  } catch (err) {
    const msg = 'Failed to write leads to Google Sheets';
    await sendErrorNotification('Google Sheets Write Error', `${msg}: ${err.message}`);
  }
}

module.exports = { runWorkflow };
