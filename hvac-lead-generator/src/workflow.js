'use strict';

/**
 * Core workflow: search Apollo → dedupe against sheet → append new rows.
 *
 * Designed to be called by the scheduler OR directly via:
 *   npm run run-once
 */

const { searchLeads }             = require('./apolloSearch');
const { getExistingBusinessNames, appendLeads } = require('./sheetsManager');
const { sendAlert }               = require('./notifier');
const logger                      = require('./logger');

/**
 * Run one full lead-generation cycle.
 * Returns a summary object for testing/logging.
 */
async function runWorkflow() {
  const startTime  = Date.now();
  const maxLeads   = parseInt(process.env.MAX_LEADS_PER_RUN, 10) || 25;

  logger.info('═══════════════════════════════════════════');
  logger.info('HVAC Lead Generator — workflow starting');
  logger.info(`Target: up to ${maxLeads} new leads`);
  logger.info('═══════════════════════════════════════════');

  let apolloLeads    = [];
  let existingNames  = new Set();
  let newLeads       = [];
  let appended       = 0;

  // ── Step 1: Fetch leads from Apollo ────────────────────────────────────
  try {
    // Request extra results so we have room after deduplication.
    // Apollo caps per_page at 100; requesting 3× our target gives headroom.
    apolloLeads = await searchLeads(Math.min(maxLeads * 3, 100));
  } catch (err) {
    const msg = `Failed to fetch leads from Apollo: ${err.message}`;
    logger.error(msg);
    await sendAlert('Apollo fetch failed', msg);
    return { success: false, error: msg };
  }

  if (apolloLeads.length === 0) {
    const msg = 'Apollo returned 0 results — check filters or API quota.';
    logger.warn(msg);
    await sendAlert('Apollo returned 0 results', msg);
    return { success: true, fetched: 0, appended: 0, warning: msg };
  }

  // ── Step 2: Read existing business names from the sheet ─────────────────
  try {
    existingNames = await getExistingBusinessNames();
  } catch (err) {
    const msg = `Failed to read Google Sheet for deduplication: ${err.message}`;
    logger.error(msg);
    await sendAlert('Google Sheets read failed', msg);
    return { success: false, error: msg };
  }

  // ── Step 3: Remove duplicates ────────────────────────────────────────────
  const seen = new Set(); // guard against duplicates within this batch too

  newLeads = apolloLeads.filter(lead => {
    const key = lead.businessName.toLowerCase().trim();
    if (existingNames.has(key) || seen.has(key)) {
      logger.debug(`Skipping duplicate: ${lead.businessName}`);
      return false;
    }
    seen.add(key);
    return true;
  });

  // Honour the per-run cap after deduplication
  if (newLeads.length > maxLeads) {
    logger.info(`Trimming batch from ${newLeads.length} → ${maxLeads} (MAX_LEADS_PER_RUN limit)`);
    newLeads = newLeads.slice(0, maxLeads);
  }

  logger.info(`After deduplication: ${newLeads.length} new lead(s) to add (${apolloLeads.length - newLeads.length} duplicate(s) skipped)`);

  // ── Step 4: Append to Google Sheet ──────────────────────────────────────
  if (newLeads.length > 0) {
    try {
      appended = await appendLeads(newLeads);
    } catch (err) {
      const msg = `Failed to write leads to Google Sheet: ${err.message}`;
      logger.error(msg);
      await sendAlert('Google Sheets write failed', msg);
      return { success: false, error: msg };
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info('═══════════════════════════════════════════');
  logger.info(`Workflow complete in ${elapsed}s — ${appended} lead(s) added.`);
  logger.info('═══════════════════════════════════════════');

  return {
    success:    true,
    fetched:    apolloLeads.length,
    duplicates: apolloLeads.length - newLeads.length,
    appended,
    elapsedSec: parseFloat(elapsed),
  };
}

module.exports = { runWorkflow };
