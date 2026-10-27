/**
 * HVAC Lead Generator — main entry point.
 *
 * Searches Apollo.io for HVAC companies in Southwest Michigan and appends
 * new leads to a Google Sheets spreadsheet. Runs automatically via node-cron
 * every morning at 7:00 AM Eastern Time.
 *
 * Usage:
 *   node index.js              → start the scheduler (runs at 7am ET daily)
 *   node index.js --run-now    → execute one immediate run, then exit
 */

require('dotenv').config();

const cron = require('node-cron');
const { searchHVACLeads } = require('./apollo');
const { buildSheetsClient, appendLeads } = require('./sheets');
const { notifyError } = require('./notify');

// ── Configuration (tweak these without touching core logic) ──────────────────

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN ?? '25', 10);
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME ?? 'Leads';
const KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ?? './google-credentials.json';
const APOLLO_KEY = process.env.APOLLO_API_KEY;

// 7:00 AM Eastern — cron uses server local time, so we use explicit America/New_York timezone
const CRON_SCHEDULE = '0 7 * * *';
const CRON_TIMEZONE = 'America/New_York';

// ── Core run function ────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const runStart = new Date().toISOString();
  console.log(`\n[${runStart}] Starting HVAC lead generation run...`);

  // Validate required config
  const missing = [];
  if (!APOLLO_KEY)        missing.push('APOLLO_API_KEY');
  if (!SPREADSHEET_ID)    missing.push('GOOGLE_SPREADSHEET_ID');

  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(', ')}`;
    await notifyError('Configuration error — run aborted', msg);
    return;
  }

  // 1. Search Apollo.io
  let leads;
  try {
    console.log(`[apollo] Searching for up to ${MAX_LEADS} HVAC leads in SW Michigan...`);
    leads = await searchHVACLeads(APOLLO_KEY, MAX_LEADS);
    console.log(`[apollo] Found ${leads.length} lead(s) from Apollo.`);
  } catch (err) {
    await notifyError('Apollo.io search failed', err);
    return;
  }

  if (leads.length === 0) {
    await notifyError(
      'Apollo returned 0 results',
      'The Apollo search returned no contacts. Check API key, filters, or credit balance.'
    );
    return;
  }

  // 2. Write to Google Sheets
  let result;
  try {
    console.log('[sheets] Connecting to Google Sheets...');
    const sheets = buildSheetsClient(KEY_FILE);
    result = await appendLeads(sheets, SPREADSHEET_ID, SHEET_NAME, leads);
  } catch (err) {
    await notifyError('Google Sheets write failed', err);
    return;
  }

  // 3. Summary
  const runEnd = new Date().toISOString();
  console.log(`[${runEnd}] Run complete — added: ${result.added}, skipped (duplicates): ${result.skipped}`);
}

// ── Entry point ──────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // One-shot execution for testing or manual runs
  runLeadGeneration()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Unhandled error:', err);
      process.exit(1);
    });
} else {
  // Schedule recurring runs at 7am Eastern
  console.log(`[scheduler] HVAC lead generator started.`);
  console.log(`[scheduler] Next run: ${CRON_SCHEDULE} (${CRON_TIMEZONE}) — 7:00 AM ET daily`);
  console.log(`[scheduler] Max leads per run: ${MAX_LEADS}`);
  console.log(`[scheduler] Spreadsheet ID: ${SPREADSHEET_ID ?? '(not set)'}`);
  console.log(`[scheduler] Sheet tab: ${SHEET_NAME}`);

  cron.schedule(CRON_SCHEDULE, runLeadGeneration, { timezone: CRON_TIMEZONE });

  // Keep the process alive
  console.log('[scheduler] Waiting for next scheduled run. Press Ctrl+C to stop.\n');
}
