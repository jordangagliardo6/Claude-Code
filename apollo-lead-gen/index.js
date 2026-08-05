/**
 * Apollo HVAC Lead Generation — Daily Scheduler
 *
 * Runs every morning at 7:00 AM Eastern Time.
 * Pulls up to MAX_LEADS_PER_RUN new HVAC contacts from Apollo.io
 * and appends them to a Google Sheets spreadsheet.
 *
 * Usage:
 *   node index.js          → start scheduler (7am ET daily)
 *   node index.js --now    → run one pull immediately, then keep scheduler running
 */

require('dotenv').config();

const cron  = require('node-cron');
const { searchLeads }              = require('./src/apollo');
const { getExistingBusinessNames, appendToSheet } = require('./src/sheets');

// ─── Config ───────────────────────────────────────────────────────────────────
// These are the only values you should need to change for normal operation.

/** SW Michigan cities to search. Update this list to add/remove areas. */
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

/** Max new leads added per daily run. Keep at 25 to stay manageable. */
const MAX_LEADS_PER_RUN = 25;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log an error with timestamp and optionally send an email notification.
 * To enable email: uncomment the nodemailer block below and configure SMTP.
 */
function logError(context, err) {
  const ts  = new Date().toISOString();
  const msg = `[ERROR ${ts}] ${context}: ${err?.message || String(err)}`;
  console.error(msg);

  // ── Optional email notification via nodemailer ───────────────────────────
  // 1. npm install nodemailer
  // 2. Set SMTP_USER and SMTP_PASS in .env (use a Gmail App Password)
  // 3. Uncomment the block below:
  //
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   service: 'gmail',
  //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // });
  // transporter.sendMail({
  //   from: process.env.SMTP_USER,
  //   to:   process.env.NOTIFICATION_EMAIL,
  //   subject: 'Lead Gen Error',
  //   text: msg,
  // }).catch(e => console.error('Email notification failed:', e.message));
}

/**
 * Core pipeline:
 *   1. Read existing business names from the sheet (dedup check)
 *   2. Search Apollo.io for new HVAC leads
 *   3. Append new leads to the sheet
 */
async function runLeadGeneration() {
  const startedAt = Date.now();
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n[${timestamp} ET] ─── Lead generation run starting ───`);

  // Step 1 — read existing data for dedup
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames();
    console.log(`Sheet contains ${existingNames.size} existing business(es) — will skip duplicates`);
  } catch (err) {
    logError('Failed to read Google Sheet', err);
    console.error('Cannot continue without existing-name list. Aborting run.');
    return;
  }

  // Step 2 — search Apollo
  let leads;
  try {
    leads = await searchLeads(TARGET_CITIES, MAX_LEADS_PER_RUN, existingNames);
  } catch (err) {
    logError('Apollo.io search/enrich failed', err);
    return;
  }

  if (!leads || leads.length === 0) {
    console.log('No new leads found this run (Apollo returned no new contacts with phone numbers).');
    console.log('This is normal if the area is saturated — try expanding TARGET_CITIES.');
    return;
  }

  // Step 3 — write to sheet
  try {
    await appendToSheet(leads);
    console.log(`\n✓ Added ${leads.length} new lead(s) to Google Sheet:`);
    leads.forEach((l, i) => {
      const site = l.website ? ` | ${l.website}` : '';
      console.log(`  ${String(i + 1).padStart(2)}. ${l.businessName} — ${l.firstName} ${l.lastName} (${l.city}) ${l.phone}${site}`);
    });
  } catch (err) {
    logError('Failed to write to Google Sheet', err);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n─── Run complete in ${elapsed}s ───\n`);
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

// Cron expression: minute=0, hour=7 → 7:00 AM
// node-cron v3 supports the `timezone` option directly
cron.schedule('0 7 * * *', runLeadGeneration, {
  timezone: 'America/New_York',
});

console.log('Apollo HVAC Lead Gen scheduler started.');
console.log('Runs daily at 7:00 AM Eastern Time.');
console.log('');
console.log('Commands:');
console.log('  node index.js --now    run a pull immediately');
console.log('  node index.js          keep running on schedule (Ctrl+C to stop)');
console.log('');

// Immediate run when --now flag is passed
if (process.argv.includes('--now')) {
  runLeadGeneration();
}
