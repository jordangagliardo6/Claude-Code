/**
 * HVAC Lead Generation Workflow
 * ─────────────────────────────
 * Searches Apollo.io for SW Michigan HVAC companies,
 * deduplicates against the master Google Sheet,
 * and appends up to 25 new leads per run.
 *
 * Usage:
 *   node index.js            → runs the cron scheduler (keeps process alive)
 *   node index.js --run-now  → executes one run immediately, then exits
 */

require('dotenv').config();

const cron = require('node-cron');
const config = require('./config');
const { searchHvacLeads } = require('./apollo');
const { getSheetsClient, getExistingBusinessNames, ensureHeader, appendLeads } = require('./sheets');
const { logError, logSuccess, sendErrorEmail } = require('./notify');

/** Core workflow: fetch leads → dedupe → append. */
async function runWorkflow() {
  console.log(`\n[${new Date().toISOString()}] Starting HVAC lead generation run…`);

  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    const msg = 'APOLLO_API_KEY is not set. Add it to your .env file.';
    logError('startup', new Error(msg));
    await sendErrorEmail('Config Error', msg);
    return;
  }

  let sheets;
  try {
    sheets = await getSheetsClient();
  } catch (err) {
    logError('Google Sheets auth', err);
    await sendErrorEmail('Google Sheets Auth Failed', err.message);
    return;
  }

  // ── 1. Ensure the sheet has a header row ──────────────────────────────────
  try {
    await ensureHeader(sheets);
  } catch (err) {
    logError('ensureHeader', err);
    await sendErrorEmail('Sheet Setup Failed', err.message);
    return;
  }

  // ── 2. Load existing business names for deduplication ────────────────────
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames(sheets);
    console.log(`Found ${existingNames.size} existing business(es) in the sheet.`);
  } catch (err) {
    logError('reading existing leads', err);
    await sendErrorEmail('Sheet Read Failed', err.message);
    return;
  }

  // ── 3. Search Apollo.io ───────────────────────────────────────────────────
  let leads;
  try {
    leads = await searchHvacLeads(apolloKey, config.MAX_LEADS_PER_RUN);
    console.log(`Apollo returned ${leads.length} candidate lead(s).`);
  } catch (err) {
    logError('Apollo search', err);
    await sendErrorEmail(
      'Apollo Search Failed',
      `Apollo.io search returned an error:\n\n${err.message}\n\nCheck your APOLLO_API_KEY and network access.`
    );
    return;
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned 0 results. Check your API key, search filters, or Apollo quota.';
    logError('Apollo search', new Error(msg));
    await sendErrorEmail('No Apollo Results', msg);
    return;
  }

  // ── 4. Append new leads to the sheet ─────────────────────────────────────
  let added;
  try {
    added = await appendLeads(leads, existingNames, sheets);
  } catch (err) {
    logError('appending to sheet', err);
    await sendErrorEmail(
      'Sheet Write Failed',
      `Could not write leads to Google Sheet:\n\n${err.message}\n\nCheck service account permissions on the spreadsheet.`
    );
    return;
  }

  logSuccess(added, existingNames.size + added);
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (process.argv.includes('--run-now')) {
  // One-shot mode: run once immediately, then exit
  runWorkflow().then(() => {
    console.log('One-shot run complete.');
    process.exit(0);
  }).catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
} else {
  // Scheduled mode: register cron and keep the process alive
  console.log(`Scheduler started. Runs at: "${config.CRON_SCHEDULE}" (${config.CRON_TIMEZONE})`);
  console.log('Spreadsheet:', `https://docs.google.com/spreadsheets/d/${config.SPREADSHEET_ID}`);

  cron.schedule(config.CRON_SCHEDULE, runWorkflow, {
    timezone: config.CRON_TIMEZONE,
  });

  // Keep alive message so you know it's running
  setInterval(() => {
    const next = 'next run at 7:00 AM ET';
    process.stdout.write(`\r[${new Date().toLocaleTimeString()}] Scheduler alive — ${next}`);
  }, 60_000);
}
