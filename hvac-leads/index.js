/**
 * HVAC Lead Generator — main entry point
 *
 * Runs on a cron schedule (7:00 AM Eastern Time, every day).
 * Fetches up to MAX_LEADS_PER_RUN new HVAC contacts from Apollo.io
 * and appends them to the master Google Sheet, skipping duplicates.
 *
 * Usage:
 *   node index.js            — start the scheduler (runs continuously)
 *   node index.js --run-now  — run once immediately, then exit
 */

require('dotenv').config();

const cron = require('node-cron');
const { searchHvacLeads } = require('./lib/apollo');
const { getSheetsClient, getExistingBusinessNames, appendLeads } = require('./lib/sheets');
const { notifyError, logSuccess } = require('./lib/notify');

// ── Configuration ──────────────────────────────────────────────────────────────

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8';
const SHEET_TAB      = process.env.SHEET_TAB_NAME  || 'Untitled';
const MAX_LEADS      = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
const APOLLO_KEY     = process.env.APOLLO_API_KEY;

// Cron: 7:00 AM every day, America/New_York (handles EST/EDT automatically)
const CRON_SCHEDULE  = '0 7 * * *';
const CRON_TIMEZONE  = 'America/New_York';

// ── Core logic ─────────────────────────────────────────────────────────────────

async function runLeadGeneration() {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`HVAC Lead Generation — ${new Date().toLocaleString('en-US', { timeZone: CRON_TIMEZONE })}`);
  console.log('─'.repeat(60));

  if (!APOLLO_KEY) {
    await notifyError(
      'Apollo API key missing',
      'APOLLO_API_KEY is not set in .env — cannot fetch leads.'
    );
    return;
  }

  // ── Step 1: Fetch leads from Apollo ──────────────────────────────────────
  let apolloContacts = [];
  let totalFetched = 0;

  try {
    console.log(`Fetching up to ${MAX_LEADS} leads from Apollo.io…`);
    const { contacts, totalEntries } = await searchHvacLeads(APOLLO_KEY, 1, MAX_LEADS);
    apolloContacts = contacts;
    totalFetched = contacts.length;
    console.log(`  Apollo returned ${totalFetched} contacts (${totalEntries} total available)`);
  } catch (err) {
    await notifyError(
      'Apollo API request failed',
      err.response
        ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
        : err
    );
    return;
  }

  if (apolloContacts.length === 0) {
    await notifyError(
      'Apollo returned zero results',
      'The People Search query returned no contacts. ' +
      'Check your API key, quota, and filter settings in lib/apollo.js.'
    );
    return;
  }

  // ── Step 2: Connect to Google Sheets ─────────────────────────────────────
  let sheets;
  try {
    sheets = await getSheetsClient();
    console.log('Connected to Google Sheets ✓');
  } catch (err) {
    await notifyError('Google Sheets authentication failed', err);
    return;
  }

  // ── Step 3: Read existing business names for dedup ───────────────────────
  let existing;
  try {
    existing = await getExistingBusinessNames(sheets, SPREADSHEET_ID, SHEET_TAB);
    console.log(`  ${existing.size} existing entries found in sheet`);
  } catch (err) {
    await notifyError('Failed to read existing sheet data', err);
    return;
  }

  // ── Step 4: Append new rows ───────────────────────────────────────────────
  let result;
  try {
    result = await appendLeads(sheets, SPREADSHEET_ID, SHEET_TAB, apolloContacts, existing);
  } catch (err) {
    await notifyError('Failed to write to Google Sheet', err);
    return;
  }

  logSuccess({ added: result.added, skipped: result.skipped, totalFetched });

  if (result.added > 0) {
    console.log('\nNew leads added:');
    result.rows.forEach(row => {
      console.log(`  • ${row[1]} — ${row[5]} — ${row[4]}`);
    });
  } else {
    console.log('No new leads to add (all results were duplicates).');
  }
}

// ── Scheduler / CLI ────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // One-shot mode: run immediately and exit
  runLeadGeneration()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Unhandled error:', err);
      process.exit(1);
    });
} else {
  // Scheduled mode: run at 7am ET daily
  console.log(`Scheduler started. Next run: 7:00 AM Eastern Time (${CRON_SCHEDULE} ${CRON_TIMEZONE})`);
  console.log('Press Ctrl+C to stop.\n');

  // Validate the schedule before starting
  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`Invalid cron expression: ${CRON_SCHEDULE}`);
    process.exit(1);
  }

  cron.schedule(CRON_SCHEDULE, runLeadGeneration, { timezone: CRON_TIMEZONE });
}
