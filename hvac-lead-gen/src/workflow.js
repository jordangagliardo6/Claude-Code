'use strict';

/**
 * Core workflow — runs one complete lead-generation cycle:
 *   1. Read existing business names from Google Sheets (dedup list).
 *   2. Search Apollo for new HVAC leads matching our filters.
 *   3. Append fresh leads to the spreadsheet.
 *   4. Log results / send notifications.
 *
 * Called both by the scheduler (index.js) and the one-shot runner (run-once.js).
 */

const { fetchNewLeads } = require('./apollo');
const { appendLeads, readExistingNames } = require('./sheets');
const { notifyError, logSuccess } = require('./notify');
const { MAX_LEADS_PER_RUN } = require('./config');

async function runWorkflow() {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[Workflow] Starting run at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);

  // ── Step 1: Load existing names for dedup ──────────────────────────────────
  let existingNames;
  try {
    existingNames = await readExistingNames();
    console.log(`[Workflow] ${existingNames.size} existing business(es) found in sheet — will skip duplicates.`);
  } catch (err) {
    await notifyError(
      'Google Sheets read failed',
      `Could not connect to Google Sheets before fetching leads.\n\nError: ${err.message}`
    );
    return; // Abort — nothing to dedup against
  }

  const existingCount = existingNames.size;

  // ── Step 2: Fetch new leads from Apollo ────────────────────────────────────
  let leads;
  try {
    leads = await fetchNewLeads(MAX_LEADS_PER_RUN, existingNames);
    console.log(`[Workflow] Apollo returned ${leads.length} new lead(s) with phone numbers.`);
  } catch (err) {
    await notifyError(
      'Apollo.io search failed',
      `Lead search did not complete.\n\nError: ${err.message}`
    );
    return;
  }

  if (leads.length === 0) {
    await notifyError(
      'Apollo returned 0 results',
      'The Apollo search matched no new contacts with phone numbers for the configured cities/industries.\n\n' +
      'Action needed: check your APOLLO_API_KEY, confirm the account has people-search access, ' +
      'or broaden the filters in src/config.js.'
    );
    return;
  }

  // ── Step 3: Append to Google Sheets ────────────────────────────────────────
  let written;
  try {
    written = await appendLeads(leads);
  } catch (err) {
    await notifyError(
      'Google Sheets write failed',
      `Found ${leads.length} lead(s) but could not write them to the spreadsheet.\n\nError: ${err.message}`
    );
    return;
  }

  logSuccess(written, existingCount);
}

module.exports = { runWorkflow };
