/**
 * Main workflow orchestration
 *
 * Ties Apollo search → deduplication → Google Sheets append into a single
 * async function.  Called by the cron scheduler in index.js and directly by
 * the `npm run run-now` script for manual/test runs.
 */

'use strict';

require('dotenv').config();

const { ApolloClient } = require('./apollo');
const { SheetsClient } = require('./sheets');
const { sendErrorAlert } = require('./notifier');
const logger = require('./logger');

const MAX_LEADS_PER_RUN = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

async function runWorkflow() {
  logger.info('═══════════════════════════════════════════════════');
  logger.info('Lead generation workflow starting');
  logger.info(`Max leads this run: ${MAX_LEADS_PER_RUN}`);

  let apolloLeads = [];
  let newLeadsAdded = 0;

  // ── Step 1: Pull leads from Apollo ────────────────────────────────────────
  try {
    const apollo = new ApolloClient(process.env.APOLLO_API_KEY);
    apolloLeads = await apollo.searchLeads(MAX_LEADS_PER_RUN);

    if (!apolloLeads.length) {
      const msg = 'Apollo returned zero results matching the current filters.';
      logger.warn(msg);
      await sendErrorAlert('Apollo returned 0 results', msg);
      return { leadsFound: 0, leadsAdded: 0 };
    }

    logger.info(`Apollo: ${apolloLeads.length} lead(s) with phone numbers found`);
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    logger.error(msg);
    await sendErrorAlert('Apollo API Error', msg);
    return { leadsFound: 0, leadsAdded: 0, error: msg };
  }

  // ── Step 2: Deduplication against existing sheet data ─────────────────────
  let newLeads = apolloLeads;
  try {
    const sheets = new SheetsClient(process.env.SPREADSHEET_ID);
    const existingNames = await sheets.getExistingBusinessNames();

    newLeads = apolloLeads.filter((lead) => {
      const normalized = lead.businessName.trim().toLowerCase();
      if (!normalized) return false; // skip blank business names
      if (existingNames.has(normalized)) {
        logger.info(`Skipping duplicate: ${lead.businessName}`);
        return false;
      }
      return true;
    });

    const dupeCount = apolloLeads.length - newLeads.length;
    logger.info(`Deduplication: ${dupeCount} duplicate(s) removed, ${newLeads.length} new lead(s) remain`);
  } catch (err) {
    // Dedup failure is non-fatal — continue with all leads to avoid data loss
    logger.warn(`Dedup check failed (${err.message}) — writing all leads without dedup`);
  }

  if (!newLeads.length) {
    logger.info('All returned leads already exist in the sheet — nothing to write');
    return { leadsFound: apolloLeads.length, leadsAdded: 0 };
  }

  // Respect the per-run cap after deduplication
  if (newLeads.length > MAX_LEADS_PER_RUN) {
    logger.info(`Capping write to ${MAX_LEADS_PER_RUN} leads this run`);
    newLeads = newLeads.slice(0, MAX_LEADS_PER_RUN);
  }

  // ── Step 3: Append to Google Sheets ───────────────────────────────────────
  try {
    const sheets = new SheetsClient(process.env.SPREADSHEET_ID);
    await sheets.ensureHeader();
    newLeadsAdded = await sheets.appendLeads(newLeads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    logger.error(msg);
    await sendErrorAlert('Google Sheets Write Error', msg);
    return { leadsFound: apolloLeads.length, leadsAdded: 0, error: msg };
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  logger.info(`Workflow complete — ${newLeadsAdded} new lead(s) added to spreadsheet`);
  logger.info('═══════════════════════════════════════════════════');

  return { leadsFound: apolloLeads.length, leadsAdded: newLeadsAdded };
}

module.exports = { runWorkflow };
