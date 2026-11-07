/**
 * HVAC Lead Gen — Main entry point
 *
 * Runs the lead-pull workflow on a cron schedule (default 7:00 AM Eastern).
 * Pass --run-now to execute immediately without waiting for the schedule:
 *   node index.js --run-now
 *
 * Environment variables (copy .env.example → .env and fill in):
 *   APOLLO_API_KEY, GOOGLE_CREDENTIALS_PATH, SPREADSHEET_ID, SHEET_NAME,
 *   ALERT_EMAIL, GMAIL_USER, GMAIL_APP_PASSWORD, MAX_LEADS_PER_RUN, CRON_SCHEDULE
 */

'use strict';

require('dotenv').config();

const cron = require('node-cron');
const { fetchApolloLeads } = require('./src/apollo');
const { appendLeads } = require('./src/sheets');
const { sendErrorAlert } = require('./src/notify');

// --- Config ---------------------------------------------------------------

const CONFIG = {
  apolloApiKey: process.env.APOLLO_API_KEY,
  credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials/google-service-account.json',
  spreadsheetId: process.env.SPREADSHEET_ID || '1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8',
  sheetName: process.env.SHEET_NAME || 'Sheet1',
  maxLeads: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  cronSchedule: process.env.CRON_SCHEDULE || '0 7 * * *',
  notify: {
    gmailUser: process.env.GMAIL_USER,
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
    alertEmail: process.env.ALERT_EMAIL,
  },
};

// --- Core workflow --------------------------------------------------------

async function runWorkflow() {
  const runStart = new Date().toISOString();
  console.log(`\n[lead-gen] ── Run started at ${runStart} ──`);

  // 1. Validate required config
  if (!CONFIG.apolloApiKey) {
    const msg = 'APOLLO_API_KEY is not set. Add it to your .env file.';
    console.error(`[lead-gen] ERROR: ${msg}`);
    await sendErrorAlert('Missing APOLLO_API_KEY', msg, CONFIG.notify);
    return;
  }

  // 2. Pull leads from Apollo.io
  let leads;
  try {
    console.log(`[lead-gen] Fetching up to ${CONFIG.maxLeads} leads from Apollo.io…`);
    leads = await fetchApolloLeads(CONFIG.apolloApiKey, CONFIG.maxLeads);
    console.log(`[lead-gen] Apollo returned ${leads.length} qualifying lead(s).`);
  } catch (err) {
    const msg = `Apollo.io API error: ${err.message}`;
    console.error(`[lead-gen] ERROR: ${msg}`);
    if (err.response) {
      console.error('[lead-gen] Response status:', err.response.status);
      console.error('[lead-gen] Response data:', JSON.stringify(err.response.data, null, 2));
    }
    await sendErrorAlert('Apollo API failure', `${msg}\n\n${err.stack}`, CONFIG.notify);
    return;
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned 0 qualifying leads for this run. No results matched the filters (industry + location + phone required).';
    console.warn(`[lead-gen] WARNING: ${msg}`);
    await sendErrorAlert('Zero leads returned from Apollo', msg, CONFIG.notify);
    return;
  }

  // 3. Append new leads to Google Sheets (skips duplicates)
  let result;
  try {
    console.log(`[lead-gen] Writing leads to spreadsheet ${CONFIG.spreadsheetId}…`);
    result = await appendLeads(
      CONFIG.credentialsPath,
      CONFIG.spreadsheetId,
      CONFIG.sheetName,
      leads
    );
  } catch (err) {
    const msg = `Google Sheets write error: ${err.message}`;
    console.error(`[lead-gen] ERROR: ${msg}`);
    await sendErrorAlert('Google Sheets write failure', `${msg}\n\n${err.stack}`, CONFIG.notify);
    return;
  }

  // 4. Summary
  const runEnd = new Date().toISOString();
  console.log(
    `[lead-gen] ── Run complete at ${runEnd} — ${result.added} new lead(s) added, ${result.skipped} duplicate(s) skipped ──\n`
  );
}

// --- Scheduler ------------------------------------------------------------

function startScheduler() {
  if (!cron.validate(CONFIG.cronSchedule)) {
    console.error(`[lead-gen] Invalid CRON_SCHEDULE: "${CONFIG.cronSchedule}". Using default "0 7 * * *".`);
    CONFIG.cronSchedule = '0 7 * * *';
  }

  console.log(`[lead-gen] Scheduler started. Cron: "${CONFIG.cronSchedule}" (server TZ: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
  console.log('[lead-gen] Set TZ=America/New_York in your environment to lock runs to Eastern Time.');

  cron.schedule(CONFIG.cronSchedule, () => {
    runWorkflow().catch((err) => {
      console.error('[lead-gen] Unhandled error in runWorkflow:', err);
    });
  });

  console.log('[lead-gen] Waiting for next scheduled run. Use "node index.js --run-now" to test immediately.\n');
}

// --- Entrypoint -----------------------------------------------------------

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // Immediate single run (for testing or manual execution)
  runWorkflow()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[lead-gen] Fatal error:', err);
      process.exit(1);
    });
} else {
  // Start the cron scheduler and keep the process alive
  startScheduler();
}
