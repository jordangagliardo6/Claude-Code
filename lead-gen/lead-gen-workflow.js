/**
 * lead-gen-workflow.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Automated HVAC lead generation: Apollo.io → Google Sheets
 *
 * What it does:
 *   1. Searches Apollo.io for HVAC company owner-level contacts in SW Michigan
 *   2. Deduplicates against the existing Google Sheet (Business Name column)
 *   3. Appends up to 25 new leads per run with today's date
 *   4. Runs automatically every morning at 7am Eastern Time
 *   5. Emails you on any failure so nothing silently breaks
 *
 * Usage:
 *   node lead-gen-workflow.js          # start the scheduler (runs 24/7)
 *   node lead-gen-workflow.js --now    # run the job immediately (test / first run)
 *
 * Prerequisites: See README.md for environment variable setup.
 */

require('dotenv').config();
const cron = require('node-cron');
const nodemailer = require('nodemailer');

const config  = require('./src/config');
const { searchApolloLeads }                                 = require('./src/apollo');
const { getSheetsClient, getExistingBusinessNames, appendLeadsToSheet } = require('./src/sheets');

// ─── Connectivity Check ───────────────────────────────────────────────────────

/**
 * Verify that both Apollo and Google Sheets are reachable before the first
 * scheduled run. Logs success or throws a descriptive error.
 */
async function verifyConnections() {
  console.log('\n── Connectivity Check ──────────────────────────────────────');

  // 1. Apollo: check that the API key is set and the endpoint responds
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set in your environment. Add it to .env');
  }
  console.log('[✓] APOLLO_API_KEY is present');

  // 2. Google Sheets: attempt to read the spreadsheet
  const sheets = await getSheetsClient();
  const existingNames = await getExistingBusinessNames(
    sheets,
    config.SPREADSHEET_ID,
    config.SHEET_TAB_NAME,
  );
  console.log(`[✓] Google Sheets connection OK — ${existingNames.size} existing business names loaded`);
  console.log('────────────────────────────────────────────────────────────\n');
  return true;
}

// ─── Core Run Logic ───────────────────────────────────────────────────────────

/**
 * One full pipeline run:
 *   1. Search Apollo → 2. Deduplicate → 3. Append to sheet
 */
async function runLeadGenPipeline() {
  const startTime = new Date();
  console.log(`\n[${startTime.toISOString()}] Starting HVAC lead gen run...`);

  // Step 1: Authenticate with Google Sheets + fetch existing names
  const sheets = await getSheetsClient();
  const existingNames = await getExistingBusinessNames(
    sheets,
    config.SPREADSHEET_ID,
    config.SHEET_TAB_NAME,
  );

  // Step 2: Search Apollo for leads
  const apolloLeads = await searchApolloLeads(config);
  if (apolloLeads.length === 0) {
    const msg = 'Apollo returned 0 leads with phone numbers for the given filters.';
    console.warn(`[!] ${msg}`);
    await sendErrorEmail('Apollo returned 0 results', msg);
    return;
  }

  // Step 3: Deduplicate — skip any business already in the spreadsheet
  const newLeads = apolloLeads.filter((lead) => {
    const key = lead.businessName.trim().toLowerCase();
    return key.length > 0 && !existingNames.has(key);
  });
  console.log(`[Dedup] ${apolloLeads.length} Apollo leads → ${newLeads.length} after dedup`);

  // Step 4: Cap at MAX_LEADS_PER_RUN
  const leadsToAdd = newLeads.slice(0, config.MAX_LEADS_PER_RUN);

  // Step 5: Append to sheet
  const count = await appendLeadsToSheet(
    sheets,
    config.SPREADSHEET_ID,
    config.SHEET_TAB_NAME,
    leadsToAdd,
    config.COLUMNS,
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Done] Added ${count} new leads in ${elapsed}s`);
}

// ─── Error Notification ───────────────────────────────────────────────────────

/**
 * Send an email alert when the pipeline fails or returns no results.
 * Uses Gmail SMTP via nodemailer. Requires GMAIL_USER and GMAIL_APP_PASSWORD env vars.
 * If those aren't set, falls back to console-only logging.
 *
 * @param {string} subject
 * @param {string} body
 */
async function sendErrorEmail(subject, body) {
  console.error(`[ERROR] ${subject}: ${body}`);

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('[!] Email not configured — set GMAIL_USER and GMAIL_APP_PASSWORD to enable alerts.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,  // Gmail "App Password", not your main password
      },
    });

    await transporter.sendMail({
      from: config.ERROR_EMAIL_FROM || process.env.GMAIL_USER,
      to: config.ERROR_EMAIL_TO,
      subject: `[HVAC Lead Gen] ⚠️ ${subject}`,
      text: [
        `Time: ${new Date().toISOString()}`,
        `Error: ${body}`,
        '',
        'Check your Apollo API key, Google credentials, and spreadsheet permissions.',
        'Spreadsheet ID: ' + config.SPREADSHEET_ID,
      ].join('\n'),
    });

    console.log(`[Email] Alert sent to ${config.ERROR_EMAIL_TO}`);
  } catch (emailErr) {
    console.error(`[Email] Failed to send alert: ${emailErr.message}`);
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main() {
  const runNow = process.argv.includes('--now');

  if (runNow) {
    // Manual / first-run mode: verify connections then run immediately
    console.log('=== HVAC Lead Gen — Manual Run (--now flag) ===');
    try {
      await verifyConnections();
      await runLeadGenPipeline();
    } catch (err) {
      await sendErrorEmail('Pipeline failed during manual run', err.message);
      process.exit(1);
    }
  } else {
    // Scheduler mode: verify connections once at startup, then run on cron
    console.log('=== HVAC Lead Gen Scheduler Starting ===');
    console.log(`Schedule: ${config.CRON_SCHEDULE} (7am ET daily)`);
    console.log(`Max leads per run: ${config.MAX_LEADS_PER_RUN}`);
    console.log(`Target spreadsheet: https://docs.google.com/spreadsheets/d/${config.SPREADSHEET_ID}/edit`);

    try {
      await verifyConnections();
    } catch (err) {
      // Startup connectivity failure — alert and exit so the user knows to fix it
      await sendErrorEmail('Startup connectivity check failed', err.message);
      process.exit(1);
    }

    console.log('[✓] Scheduler is live. First run at 7am ET.\n');

    cron.schedule(config.CRON_SCHEDULE, async () => {
      try {
        await runLeadGenPipeline();
      } catch (err) {
        await sendErrorEmail('Pipeline run failed', err.message);
      }
    }, {
      timezone: 'America/New_York',
    });
  }
}

main();
