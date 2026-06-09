const config = require('./config');
const logger = require('./logger');
const apollo = require('./apollo');
const sheets = require('./sheets');

// Core workflow: pull leads from Apollo, deduplicate against the sheet, append new ones.
// Returns a summary object for logging and alerting.
async function runWorkflow() {
  const summary = {
    fetched: 0,
    duplicatesSkipped: 0,
    written: 0,
    errors: [],
    startedAt: new Date().toISOString(),
  };

  let auth;
  try {
    logger.info('--- HVAC Lead Gen Run Starting ---');
    auth = await sheets.getAuthClient();
    await sheets.ensureHeaders(auth);
  } catch (err) {
    summary.errors.push(`Google Sheets auth/init failed: ${err.message}`);
    logger.error(summary.errors.at(-1));
    await logger.sendErrorAlert(
      'Google Sheets auth failed',
      `The workflow could not authenticate with Google Sheets.\n\nError: ${err.message}`
    );
    return summary;
  }

  // Pull leads from Apollo
  let rawLeads = [];
  try {
    rawLeads = await apollo.searchLeads(config.maxLeadsPerRun);
    summary.fetched = rawLeads.length;

    if (rawLeads.length === 0) {
      const msg = 'Apollo.io returned 0 results. Check your API key and search filters.';
      logger.warn(msg);
      await logger.sendErrorAlert('No leads returned from Apollo', msg);
      return summary;
    }
  } catch (err) {
    summary.errors.push(`Apollo search failed: ${err.message}`);
    logger.error(summary.errors.at(-1));
    await logger.sendErrorAlert(
      'Apollo.io API Error',
      `The workflow failed to fetch leads from Apollo.io.\n\nError: ${err.message}`
    );
    return summary;
  }

  // Deduplicate: skip any business already in the sheet
  let existingNames;
  try {
    existingNames = await sheets.getExistingBusinessNames(auth);
    logger.info(`Found ${existingNames.size} existing business(es) in sheet — checking for duplicates...`);
  } catch (err) {
    summary.errors.push(`Could not read existing sheet data: ${err.message}`);
    logger.error(summary.errors.at(-1));
    await logger.sendErrorAlert('Google Sheets Read Error', err.message);
    return summary;
  }

  const newLeads = rawLeads.filter((lead) => {
    const name = lead.businessName.toLowerCase().trim();
    if (!name) return false; // skip leads with no business name
    if (existingNames.has(name)) {
      logger.info(`  Duplicate skipped: "${lead.businessName}"`);
      summary.duplicatesSkipped++;
      return false;
    }
    return true;
  });

  logger.info(`${newLeads.length} new lead(s) after deduplication.`);

  // Append to sheet
  try {
    summary.written = await sheets.appendLeads(auth, newLeads);
  } catch (err) {
    summary.errors.push(`Google Sheets write failed: ${err.message}`);
    logger.error(summary.errors.at(-1));
    await logger.sendErrorAlert(
      'Google Sheets Write Error',
      `Leads were fetched but could not be written to the sheet.\n\nError: ${err.message}`
    );
    return summary;
  }

  summary.completedAt = new Date().toISOString();
  logger.info(
    `--- Run Complete | Fetched: ${summary.fetched} | ` +
    `Dupes skipped: ${summary.duplicatesSkipped} | ` +
    `Written: ${summary.written} ---`
  );

  return summary;
}

module.exports = { runWorkflow };
