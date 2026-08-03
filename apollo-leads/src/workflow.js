/**
 * Main lead generation workflow.
 * Can be called from the cron scheduler (index.js) or run directly:
 *   node src/workflow.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { findLeads }               = require('./apollo');
const { ensureHeaders, getExistingBusinessNames, appendLeads } = require('./sheets');
const { sendAlert }               = require('./notify');
const config                      = require('./config');
const logger                      = require('./logger');

const SHEET_ID  = process.env.GOOGLE_SHEET_ID;
const APOLLO_KEY = process.env.APOLLO_API_KEY;

/**
 * Run one full cycle of the workflow:
 *   1. Validate config
 *   2. Ensure sheet headers exist
 *   3. Fetch existing business names for dedup
 *   4. Pull leads from Apollo
 *   5. Filter duplicates
 *   6. Append new leads to the sheet
 *   7. Send alert on error or if no new leads found
 *
 * @returns {{ added: number, skipped: number, total: number }}
 */
async function runWorkflow() {
  const startedAt = new Date().toISOString();
  logger.info(`─── Lead gen run started at ${startedAt} ───`);

  // 1. Validate required env vars
  if (!APOLLO_KEY) {
    const msg = 'APOLLO_API_KEY is not set. Add it to your .env file.';
    await sendAlert({ subject: 'Config error — missing API key', body: msg });
    throw new Error(msg);
  }
  if (!SHEET_ID) {
    const msg = 'GOOGLE_SHEET_ID is not set. Add it to your .env file.';
    await sendAlert({ subject: 'Config error — missing sheet ID', body: msg });
    throw new Error(msg);
  }

  let leads = [];
  let existingNames;

  try {
    // 2. Ensure headers exist in the sheet
    await ensureHeaders(SHEET_ID);

    // 3. Read existing business names for deduplication
    existingNames = await getExistingBusinessNames(SHEET_ID);
  } catch (err) {
    const msg = `Google Sheets error during setup: ${err.message}`;
    await sendAlert({ subject: 'Google Sheets connection failed', body: msg });
    throw new Error(msg);
  }

  try {
    // 4. Fetch leads from Apollo
    leads = await findLeads(APOLLO_KEY, config.maxLeadsPerRun);
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    await sendAlert({ subject: 'Apollo API error', body: msg });
    throw new Error(msg);
  }

  if (!leads.length) {
    const msg = 'Apollo returned 0 results with a phone number. Check filters or API quota.';
    await sendAlert({ subject: 'No leads found', body: msg });
    logger.warn(msg);
    return { added: 0, skipped: 0, total: 0 };
  }

  // 5. Deduplicate: skip any business already in the sheet
  const newLeads = leads.filter(
    (lead) => !existingNames.has(lead.businessName.toLowerCase().trim())
  );
  const skipped = leads.length - newLeads.length;

  if (skipped > 0) {
    logger.info(`Dedup: skipped ${skipped} businesses already in the sheet`);
  }

  if (!newLeads.length) {
    logger.info('All fetched leads are already in the sheet — nothing new to add.');
    return { added: 0, skipped, total: leads.length };
  }

  // 6. Append new leads
  let added = 0;
  try {
    added = await appendLeads(SHEET_ID, newLeads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    await sendAlert({ subject: 'Failed to write leads to Google Sheets', body: msg });
    throw new Error(msg);
  }

  const summary = `Run complete: ${added} new leads added, ${skipped} duplicates skipped. ` +
    `Total fetched from Apollo: ${leads.length}.`;
  logger.info(summary);
  logger.info(`─── Lead gen run finished ───`);

  return { added, skipped, total: leads.length };
}

// Allow direct execution: node src/workflow.js
if (require.main === module) {
  runWorkflow()
    .then(({ added, skipped }) => {
      console.log(`\nDone. ${added} leads added, ${skipped} duplicates skipped.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`\nWorkflow failed: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { runWorkflow };
