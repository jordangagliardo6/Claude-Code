/**
 * SW Michigan HVAC Lead Generation — Scheduled Workflow
 * ======================================================
 * Runs automatically every morning at 7:00 AM Eastern Time.
 * Pulls up to MAX_LEADS_PER_RUN new leads from Apollo.io and appends
 * them to the Google Sheets spreadsheet, skipping duplicates.
 *
 * QUICK START
 * -----------
 * 1. cp .env.example .env  and fill in your keys
 * 2. npm install
 * 3. node test-connection.js   ← verify both APIs connect before scheduling
 * 4. node index.js             ← starts the scheduler (keep terminal open or use PM2)
 *
 * TO RUN ONCE NOW (without waiting for 7am):
 *   node index.js --run-now
 *
 * TO KEEP RUNNING IN THE BACKGROUND (recommended):
 *   npm install -g pm2
 *   pm2 start index.js --name hvac-leads
 *   pm2 save && pm2 startup
 */

require('dotenv').config();
const cron = require('node-cron');

const { fetchLeads } = require('./src/apollo');
const { getSheetsClient, readExistingBusinessNames, appendLeads } = require('./src/sheets');
const { filterDuplicates } = require('./src/dedup');

const APOLLO_API_KEY    = process.env.APOLLO_API_KEY;
const SHEET_ID          = process.env.GOOGLE_SHEET_ID;
const KEY_FILE          = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ?? './google-credentials.json';
const MAX_LEADS         = parseInt(process.env.MAX_LEADS_PER_RUN ?? '25', 10);
const NOTIFY_EMAIL      = process.env.NOTIFICATION_EMAIL ?? '';

/**
 * Core workflow: fetch → dedup → append.
 * Called by the cron schedule and by --run-now.
 */
async function runWorkflow() {
  const startedAt = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Workflow] Starting run at ${startedAt}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // 1. Authenticate with Google Sheets
    const sheets = await getSheetsClient(KEY_FILE);

    // 2. Read existing business names to prevent duplicates
    const existingNames = await readExistingBusinessNames(sheets, SHEET_ID);

    // 3. Fetch leads from Apollo
    let leads = await fetchLeads(APOLLO_API_KEY, MAX_LEADS * 2);

    if (leads.length === 0) {
      logError('Apollo returned 0 leads — nothing to add. Check your Apollo plan and API key.', null, NOTIFY_EMAIL);
      return;
    }

    // 4. Remove duplicates
    const newLeads = filterDuplicates(leads, existingNames);

    if (newLeads.length === 0) {
      console.log('[Workflow] All fetched leads already exist in the sheet — nothing added.');
      return;
    }

    // 5. Cap at MAX_LEADS_PER_RUN
    const toAdd = newLeads.slice(0, MAX_LEADS);

    // 6. Append to Google Sheets
    const count = await appendLeads(sheets, SHEET_ID, toAdd);

    console.log(`\n[Workflow] Done — ${count} new lead(s) added to the sheet.`);
    console.log('[Workflow] View your sheet: https://docs.google.com/spreadsheets/d/' + SHEET_ID);

  } catch (err) {
    logError('Workflow failed with an unexpected error', err, NOTIFY_EMAIL);
  }
}

/**
 * Log an error clearly and emit a notification.
 * Extend this function with nodemailer or SendGrid to send real email alerts.
 */
function logError(message, err, email) {
  console.error('\n[ERROR]', message);
  if (err) console.error('[ERROR] Details:', err.message ?? err);
  if (email) {
    // To send a real email alert, install nodemailer and fill in SMTP credentials:
    //   npm install nodemailer
    //   const nodemailer = require('nodemailer');
    //   ... sendMail({ to: email, subject: 'HVAC Leads Error', text: message })
    console.error(`[NOTIFY] An alert would be sent to: ${email}`);
    console.error(`[NOTIFY] Message: ${message}`);
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

// Cron expression: "0 7 * * *" = 7:00 AM every day
// timezone: 'America/New_York' handles Eastern Time (EST/EDT) automatically
const schedule = '0 7 * * *';

if (process.argv.includes('--run-now')) {
  // Manual one-shot run — useful for first-time testing
  console.log('[Workflow] --run-now flag detected; executing immediately...');
  runWorkflow().catch((err) => {
    console.error('[FATAL]', err.message);
    process.exit(1);
  });
} else {
  // Validate env before scheduling
  if (!APOLLO_API_KEY) {
    console.error('[FATAL] APOLLO_API_KEY is not set in your .env file. Exiting.');
    process.exit(1);
  }
  if (!SHEET_ID) {
    console.error('[FATAL] GOOGLE_SHEET_ID is not set in your .env file. Exiting.');
    process.exit(1);
  }

  console.log('[Scheduler] HVAC Lead Generation workflow started');
  console.log(`[Scheduler] Will run at 7:00 AM Eastern every morning`);
  console.log(`[Scheduler] Sheet ID: ${SHEET_ID}`);
  console.log(`[Scheduler] Max leads per run: ${MAX_LEADS}`);
  console.log('[Scheduler] Run "node index.js --run-now" to trigger immediately\n');

  cron.schedule(schedule, () => {
    runWorkflow().catch((err) => {
      logError('Unhandled error in scheduled run', err, NOTIFY_EMAIL);
    });
  }, {
    timezone: 'America/New_York',
  });
}
