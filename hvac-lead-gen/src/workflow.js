'use strict';

/**
 * Main workflow — runs once per scheduled invocation.
 *
 * Flow:
 *   1. Load existing business names from the Google Sheet (for dedup).
 *   2. Search Apollo.io for HVAC leads in Southwest Michigan.
 *   3. Append new leads (skipping duplicates) to the sheet.
 *   4. Log a run summary.
 *   5. On any failure, send an error notification.
 */

const { searchLeads }             = require('./apollo');
const { appendLeads, getExistingBusinessNames } = require('./sheets');
const { sendErrorNotification }   = require('./notify');
const logger                      = require('./logger');
const config                      = require('./config');
const { google }                  = require('googleapis');

async function run() {
  const runStart = Date.now();
  logger.info('─'.repeat(60));
  logger.info('HVAC Lead Gen — starting run');
  logger.info(`Max leads this run: ${config.maxLeadsPerRun}`);

  try {
    // Step 1: Load existing business names to prevent duplicates
    logger.info('Loading existing leads from Google Sheet…');

    // We need a sheets client here just to read names
    const path = require('path');
    const fs   = require('fs');
    const credPath = path.resolve(config.credentialsPath);

    if (!fs.existsSync(credPath)) {
      throw new Error(
        `Google credentials file not found at: ${credPath}\n` +
        `Run "node setup.js" first and follow the credentials/README.md instructions.`
      );
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    const sheetsClient = google.sheets({ version: 'v4', auth: authClient });

    const existingNames = await getExistingBusinessNames(sheetsClient);
    logger.info(`Found ${existingNames.size} existing business(es) in sheet.`);

    // Step 2: Search Apollo.io
    let leads;
    try {
      leads = await searchLeads(config.maxLeadsPerRun);
    } catch (apolloErr) {
      const msg = `Apollo.io search failed: ${apolloErr.message}`;
      const detail = apolloErr.response?.data
        ? JSON.stringify(apolloErr.response.data, null, 2)
        : apolloErr.stack;
      await sendErrorNotification('Apollo search error', `${msg}\n\n${detail}`);
      return;
    }

    if (leads.length === 0) {
      const msg = 'Apollo returned 0 results. The search may be too narrow or your credits are exhausted.';
      logger.warn(msg);
      await sendErrorNotification('Apollo returned 0 leads', msg);
      return;
    }

    logger.info(`Apollo returned ${leads.length} lead(s) with phone numbers.`);

    // Step 3: Append new leads to the sheet
    let written;
    try {
      written = await appendLeads(leads, existingNames);
    } catch (sheetErr) {
      const msg = `Google Sheets write failed: ${sheetErr.message}`;
      await sendErrorNotification('Google Sheets write error', `${msg}\n\n${sheetErr.stack}`);
      return;
    }

    // Step 4: Summary
    const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
    logger.success(
      `Run complete in ${elapsed}s — ` +
      `${leads.length} leads fetched, ${written} new rows added to sheet, ` +
      `${leads.length - written} duplicate(s) skipped.`
    );
    logger.info('─'.repeat(60));

  } catch (unexpectedErr) {
    const msg = `Unexpected error: ${unexpectedErr.message}`;
    logger.error(msg);
    await sendErrorNotification('Unexpected workflow error', `${msg}\n\n${unexpectedErr.stack}`);
  }
}

// Allow direct execution: node src/workflow.js
if (require.main === module) {
  run().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}

module.exports = { run };
