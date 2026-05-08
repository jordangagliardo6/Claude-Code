'use strict';

require('dotenv').config();
const logger   = require('./logger');
const apollo   = require('./apollo');
const sheets   = require('./sheets');
const notifier = require('./notifier');

const MAX_LEADS_PER_RUN = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

/**
 * Run one full lead-generation cycle:
 *   1. Fetch candidates from Apollo.io
 *   2. Load existing business names from the spreadsheet
 *   3. Filter out duplicates
 *   4. Append new leads to the spreadsheet
 *   5. Notify on success or failure
 *
 * @returns {Promise<{added: number, skipped: number, errors: string[]}>}
 */
async function runWorkflow() {
  const startedAt = new Date().toISOString();
  logger.log(`══════════════════════════════════════════════`);
  logger.log(`Workflow started at ${startedAt}`);
  logger.log(`══════════════════════════════════════════════`);

  const result = { added: 0, skipped: 0, errors: [] };

  // ── Step 1: Pull leads from Apollo ─────────────────────────────────────────
  let candidates;
  try {
    candidates = await apollo.searchHVACLeads(MAX_LEADS_PER_RUN);
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    result.errors.push(msg);
    logger.error(msg);
    await notifier.sendAlert('Apollo.io search failed', buildErrorBody(err));
    return result;
  }

  if (candidates.length === 0) {
    const msg = 'Apollo returned 0 results — nothing to add this run.';
    logger.warn(msg);
    await notifier.sendAlert('Apollo returned 0 results', msg);
    return result;
  }

  // ── Step 2: Get existing names for dedup ───────────────────────────────────
  let existingNames;
  try {
    existingNames = await sheets.getExistingBusinessNames();
  } catch (err) {
    const msg = `Could not read spreadsheet for duplicate check: ${err.message}`;
    result.errors.push(msg);
    logger.error(msg);
    await notifier.sendAlert('Google Sheets read failed', buildErrorBody(err));
    return result;
  }

  // ── Step 3: Deduplicate ────────────────────────────────────────────────────
  const newLeads = [];
  for (const lead of candidates) {
    const key = lead.businessName.trim().toLowerCase();
    if (!key) {
      logger.warn('Skipping a lead with no business name.');
      result.skipped++;
      continue;
    }
    if (existingNames.has(key)) {
      logger.log(`Duplicate — skipping "${lead.businessName}"`);
      result.skipped++;
    } else {
      newLeads.push(lead);
    }
  }

  logger.log(`${newLeads.length} new leads after removing ${result.skipped} duplicates.`);

  if (newLeads.length === 0) {
    logger.log('All fetched leads are already in the spreadsheet. Nothing to add.');
    return result;
  }

  // ── Step 4: Write to spreadsheet ───────────────────────────────────────────
  try {
    result.added = await sheets.appendLeads(newLeads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    result.errors.push(msg);
    logger.error(msg);
    await notifier.sendAlert('Google Sheets write failed', buildErrorBody(err));
    return result;
  }

  // ── Step 5: Summary ────────────────────────────────────────────────────────
  logger.log(`Workflow complete — added: ${result.added}, skipped: ${result.skipped}`);
  await notifier.sendSummary(result.added, result.skipped);

  return result;
}

function buildErrorBody(err) {
  return [
    `Error: ${err.message}`,
    `Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
    ``,
    `Action required: check the log file in the logs/ folder for details,`,
    `then re-run manually with:  npm run run-now`,
  ].join('\n');
}

module.exports = { runWorkflow };
