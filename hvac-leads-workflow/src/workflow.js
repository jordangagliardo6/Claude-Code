/**
 * workflow.js — core lead generation logic
 *
 * Run directly:  node src/workflow.js
 * Called by:     scheduler.js on cron schedule
 */

require('dotenv').config();
const config = require('./config');
const { searchPeople, buildLeads } = require('./apolloClient');
const { getExistingBusinessNames, appendLeads } = require('./sheetsClient');
const logger = require('./logger');

async function runWorkflow() {
  logger.info('═══ HVAC Leads Workflow starting ═══');

  // ── 1. Validate configuration ──────────────────────────────────────────
  if (!config.apollo.apiKey) {
    await logger.alert(
      'Missing APOLLO_API_KEY',
      'APOLLO_API_KEY is not set in .env. The workflow cannot run without it.'
    );
    return;
  }

  // ── 2. Search Apollo for HVAC decision-makers ──────────────────────────
  let rawPeople = [];
  try {
    rawPeople = await searchPeople(1);
  } catch (err) {
    await logger.alert(
      'Apollo search failed',
      `Apollo.io returned an error during the people search:\n\n${err.message}\n\n` +
      'Check your APOLLO_API_KEY and plan level, then retry.'
    );
    return;
  }

  if (rawPeople.length === 0) {
    await logger.alert(
      'Apollo returned zero results',
      'The people search returned no results for Southwest Michigan HVAC companies.\n\n' +
      'Possible causes:\n' +
      '• Apollo data is sparse for this area — try again tomorrow\n' +
      '• Filters are too narrow — consider widening targetCities or industryKeywords in config.js\n' +
      '• Plan/credit limit reached'
    );
    return;
  }

  // ── 3. Build clean lead records (filter out no-phone contacts) ─────────
  let leads = [];
  try {
    leads = await buildLeads(rawPeople);
  } catch (err) {
    await logger.alert(
      'Lead processing failed',
      `An error occurred while processing Apollo results:\n\n${err.message}`
    );
    return;
  }

  logger.info(`${leads.length} leads have a phone number (out of ${rawPeople.length} raw prospects)`);

  if (leads.length === 0) {
    logger.warn('All prospects were missing phone numbers — nothing to write to the sheet today.');
    logger.warn('Tip: set ENRICH_FOR_PHONES=true in .env to use Apollo enrichment credits and reveal phones.');
    return;
  }

  // ── 4. Deduplicate against the existing sheet ──────────────────────────
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames();
  } catch (err) {
    await logger.alert(
      'Google Sheets read failed',
      `Could not read the leads spreadsheet to check for duplicates:\n\n${err.message}\n\n` +
      'Check your GOOGLE_SERVICE_ACCOUNT_PATH and that the service account has edit access to the sheet.'
    );
    return;
  }

  const newLeads = leads.filter(lead => {
    const key = lead.businessName.trim().toLowerCase();
    if (existingNames.has(key)) {
      logger.info(`Skipping duplicate: "${lead.businessName}"`);
      return false;
    }
    return true;
  });

  logger.info(`${newLeads.length} new leads after deduplication (${leads.length - newLeads.length} duplicates removed)`);

  if (newLeads.length === 0) {
    logger.info('No new leads to add today — all results already exist in the sheet.');
    return;
  }

  // Respect the per-run cap in case enrichment inflated the count
  const toWrite = newLeads.slice(0, config.apollo.leadsPerRun);
  if (toWrite.length < newLeads.length) {
    logger.info(`Capped at ${config.apollo.leadsPerRun} per run; ${newLeads.length - toWrite.length} deferred to next run`);
  }

  // ── 5. Write to Google Sheets ──────────────────────────────────────────
  try {
    const count = await appendLeads(toWrite);
    logger.info(`═══ Run complete — ${count} new lead(s) added ═══`);
  } catch (err) {
    await logger.alert(
      'Google Sheets write failed',
      `Found ${toWrite.length} new leads but could not write them to the spreadsheet:\n\n${err.message}`
    );
  }
}

// Allow both direct execution and require()-based invocation from scheduler.js
if (require.main === module) {
  runWorkflow().catch(err => {
    logger.error('Unhandled error in workflow', err);
    process.exit(1);
  });
}

module.exports = { runWorkflow };
