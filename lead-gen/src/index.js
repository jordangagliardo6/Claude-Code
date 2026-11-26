'use strict';

require('dotenv').config();

const cron = require('node-cron');
const logger = require('./logger');
const { searchLeads, mapToLead } = require('./apollo');
const { ensureSheet, getExistingBusinessNames, appendLeads } = require('./sheets');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
// Default: 7:00 AM Eastern every day. Override via CRON_SCHEDULE in .env.
const SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';

/**
 * Core workflow: pull leads from Apollo, deduplicate, write to Sheets.
 */
async function runWorkflow() {
  logger.info('=== HVAC Lead Gen run starting ===');

  try {
    // 1. Ensure spreadsheet tab + header row exist
    await ensureSheet();

    // 2. Load existing business names for duplicate checking
    const existingNames = await getExistingBusinessNames();

    // 3. Search Apollo.io
    let rawPeople;
    try {
      rawPeople = await searchLeads(MAX_LEADS * 2); // fetch extra to cover filtered-out no-phone contacts
    } catch (apolloErr) {
      await logger.error('Apollo.io search failed', apolloErr);
      return;
    }

    if (!rawPeople || rawPeople.length === 0) {
      await logger.error('Apollo returned zero results — check your API key and filters', null, true);
      return;
    }

    // 4. Map & filter: drop contacts with no phone, cap at MAX_LEADS
    const leads = rawPeople
      .map(mapToLead)
      .filter(Boolean)
      .slice(0, MAX_LEADS);

    logger.info(`${leads.length} lead(s) with phone numbers (after filtering ${rawPeople.length} raw results)`);

    if (leads.length === 0) {
      await logger.error('No leads had phone numbers after filtering — check Apollo contact quality settings', null, true);
      return;
    }

    // 5. Write to Google Sheets (duplicates skipped inside appendLeads)
    let written;
    try {
      written = await appendLeads(leads, existingNames);
    } catch (sheetsErr) {
      await logger.error('Google Sheets write failed', sheetsErr);
      return;
    }

    logger.info(`=== Run complete: ${written} new lead(s) added to sheet ===`);
  } catch (unexpectedErr) {
    await logger.error('Unexpected error during workflow', unexpectedErr);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const runOnce = args.includes('--once');

if (runOnce) {
  // npm run run-once — execute immediately and exit
  runWorkflow().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  // npm start — start the cron scheduler
  logger.info(`HVAC Lead Gen scheduler starting.`);
  logger.info(`Schedule: "${SCHEDULE}" (America/New_York)`);
  logger.info(`Max leads per run: ${MAX_LEADS}`);
  logger.info(`Sheet ID: ${process.env.GOOGLE_SHEET_ID || '(not set)'}`);

  if (!process.env.APOLLO_API_KEY) {
    logger.warn('APOLLO_API_KEY is not set — set it in .env before the first run.');
  }
  if (!process.env.GOOGLE_SHEET_ID) {
    logger.warn('GOOGLE_SHEET_ID is not set — set it in .env before the first run.');
  }

  cron.schedule(SCHEDULE, runWorkflow, {
    scheduled: true,
    timezone: 'America/New_York',
  });

  logger.info('Scheduler running. Press Ctrl+C to stop.');
}
