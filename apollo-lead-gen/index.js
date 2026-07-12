'use strict';

require('dotenv').config();

const cron   = require('node-cron');
const config = require('./config');
const { searchApolloLeads }                                              = require('./apollo');
const { getExistingBusinessNames, ensureHeaders, appendLeads }          = require('./sheets');

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

// ─── Optional email alert on failure ─────────────────────────────────────────
// Requires NOTIFICATION_EMAIL + SMTP_* vars in .env.
// Silently skips if those vars are not set.
async function sendErrorNotification(message) {
  const to = process.env.NOTIFICATION_EMAIL;
  if (!to || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  try {
    const nodemailer  = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from:    process.env.SMTP_USER,
      to,
      subject: '[Lead Gen] Run Failed — Action Required',
      text:    `Your automated Apollo → Sheets lead gen run failed.\n\n${message}\n\nCheck server logs for full detail.`,
    });

    console.log(`Error notification emailed to ${to}`);
  } catch (emailErr) {
    // Don't let email failure hide the original error
    console.error(`Could not send error notification email: ${emailErr.message}`);
  }
}

// ─── Core workflow ────────────────────────────────────────────────────────────
async function runLeadGeneration() {
  const runTime = new Date().toISOString();
  console.log(`\n[${runTime}] ── Lead generation run started ──`);

  try {
    // Guard: fail fast before touching any external API
    if (!SPREADSHEET_ID)           throw new Error('GOOGLE_SHEET_ID is not set in .env');
    if (!process.env.APOLLO_API_KEY) throw new Error('APOLLO_API_KEY is not set in .env');

    // Guarantee the sheet has a header row (no-op if headers already exist)
    await ensureHeaders(SPREADSHEET_ID);

    // Step 1 — Pull raw leads from Apollo.io
    console.log(`Searching Apollo.io for HVAC leads in Southwest Michigan...`);
    const apolloLeads = await searchApolloLeads();

    if (apolloLeads.length === 0) {
      console.log('Apollo returned no contacts with phone numbers. Nothing to add.');
      console.log(`[${new Date().toISOString()}] ── Run complete ──\n`);
      return;
    }

    // Step 2 — Load existing business names for deduplication
    console.log('Reading existing leads from Google Sheet...');
    const existingNames = await getExistingBusinessNames(SPREADSHEET_ID);
    console.log(`Sheet currently has ${existingNames.size} unique business(es)`);

    // Step 3 — Remove duplicates and apply per-run cap
    const newLeads = apolloLeads
      .filter(lead => {
        const key = lead.businessName.trim().toLowerCase();
        return key.length > 0 && !existingNames.has(key);
      })
      .slice(0, config.MAX_LEADS_PER_RUN);

    const duplicateCount = apolloLeads.length - newLeads.length;

    if (newLeads.length === 0) {
      console.log('All Apollo results are already in the sheet. No new leads to add.');
      console.log(`[${new Date().toISOString()}] ── Run complete ──\n`);
      return;
    }

    // Step 4 — Append new leads to Google Sheets
    const added = await appendLeads(SPREADSHEET_ID, newLeads);
    console.log(`✓ Added ${added} new lead(s) to Google Sheet`);
    if (duplicateCount > 0) {
      console.log(`  Skipped ${duplicateCount} duplicate(s)`);
    }

  } catch (err) {
    const errorDetail = `[${new Date().toISOString()}] ${err.message}\n\n${err.stack}`;
    console.error(`\n[ERROR] ${errorDetail}`);
    await sendErrorNotification(errorDetail);
  }

  console.log(`[${new Date().toISOString()}] ── Run complete ──\n`);
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
cron.schedule(config.CRON_SCHEDULE, runLeadGeneration, {
  timezone: config.TIMEZONE,
});

console.log('');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║   Apollo → Google Sheets Lead Gen Scheduler     ║');
console.log('╠══════════════════════════════════════════════════╣');
console.log('║  Schedule  :  7:00 AM Eastern, every day        ║');
console.log(`║  Cities    :  ${config.CITIES.length} Southwest Michigan cities       ║`);
console.log(`║  Max leads :  ${config.MAX_LEADS_PER_RUN} per run                          ║`);
console.log('╚══════════════════════════════════════════════════╝');
console.log('');
console.log('Tip: run  node test-connection.js  first to verify credentials.');
console.log('     run  node index.js --run-now  to pull leads immediately.\n');

// Allow an immediate manual run without waiting for the cron tick
if (process.argv.includes('--run-now')) {
  runLeadGeneration();
}
