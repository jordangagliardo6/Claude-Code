'use strict';

/**
 * Main workflow — orchestrates one full lead-generation run:
 *
 *   1. Fetch up to MAX_LEADS_PER_RUN contacts from Apollo.io
 *   2. Read existing business names from the Google Sheet
 *   3. Filter out duplicates (by Business Name, case-insensitive)
 *   4. Prioritise contacts by job title (Owner > President > Founder …)
 *   5. Append new rows to the sheet
 *   6. Log a summary and handle errors
 */

require('dotenv').config();
const apollo = require('./apollo');
const sheets = require('./sheets');
const logger = require('./logger');

// Maximum new leads to add per scheduled run. Adjust freely.
const MAX_LEADS_PER_RUN = 25;

// Title priority for sorting (lower index = higher priority).
// Contacts matching an earlier title float to the top when we have more
// Apollo results than MAX_LEADS_PER_RUN slots.
const TITLE_PRIORITY = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'co founder',
  'general manager',
];

/**
 * Run one full lead-generation cycle.
 *
 * @returns {Promise<RunSummary>}
 */
async function run() {
  const startedAt = new Date();
  logger.info('─────────────────────────────────────────');
  logger.info(`Lead-gen run started at ${startedAt.toISOString()}`);

  const summary = {
    startedAt,
    fetched: 0,
    duplicatesSkipped: 0,
    added: 0,
    error: null,
  };

  try {
    // ── Step 1: Guarantee headers exist ─────────────────────────────────────
    await sheets.ensureHeaders();

    // ── Step 2: Load existing business names for dedup ───────────────────────
    const existingNames = await sheets.getExistingBusinessNames();

    // ── Step 3: Pull leads from Apollo ───────────────────────────────────────
    // Request a little more than MAX_LEADS_PER_RUN so we still have room after
    // filtering duplicates. Apollo's per_page max is 25, so we do one page.
    const rawContacts = await apollo.searchLeads(MAX_LEADS_PER_RUN);
    summary.fetched = rawContacts.length;

    if (rawContacts.length === 0) {
      logger.warn('Apollo returned 0 contacts. Nothing to add this run.');
      notify('Lead-gen warning: Apollo returned 0 contacts. The search may need to be adjusted.');
      return summary;
    }

    // ── Step 4: Filter duplicates ─────────────────────────────────────────────
    const newContacts = rawContacts.filter((c) => {
      const key = c.companyName.trim().toLowerCase();
      if (!key) return false; // skip contacts with no company name
      if (existingNames.has(key)) return false;
      return true;
    });

    summary.duplicatesSkipped = rawContacts.length - newContacts.length;
    logger.info(
      `After dedup: ${newContacts.length} new, ${summary.duplicatesSkipped} already in sheet.`
    );

    if (newContacts.length === 0) {
      logger.info('All fetched contacts are already in the sheet. Nothing to add.');
      return summary;
    }

    // ── Step 5: Sort by title priority ────────────────────────────────────────
    newContacts.sort((a, b) => titleRank(a.title) - titleRank(b.title));

    // ── Step 6: Cap at MAX_LEADS_PER_RUN ─────────────────────────────────────
    const toInsert = newContacts.slice(0, MAX_LEADS_PER_RUN);

    // ── Step 7: Build sheet rows ──────────────────────────────────────────────
    const today = formatDate(new Date());
    const rows = toInsert.map((c) => [
      today,           // Date Added
      c.companyName,   // Business Name
      c.firstName,     // Owner First Name
      c.lastName,      // Owner Last Name
      c.phone,         // Phone Number
      c.city,          // City
      c.website,       // Website
      '',              // Called   ← intentionally blank
      '',              // Notes    ← intentionally blank
    ]);

    // ── Step 8: Append to sheet ───────────────────────────────────────────────
    summary.added = await sheets.appendRows(rows);

    logger.success(
      `Run complete. Added ${summary.added} lead(s). ` +
      `Skipped ${summary.duplicatesSkipped} duplicate(s).`
    );
  } catch (err) {
    summary.error = err.message;
    logger.error(`Run failed: ${err.message}`);
    notify(`Lead-gen ERROR: ${err.message}`);
  }

  logger.info('─────────────────────────────────────────');
  return summary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return the priority rank (0 = highest) for a job title string.
 * Titles not in the list fall to the bottom.
 */
function titleRank(title) {
  const lower = (title ?? '').toLowerCase();
  for (let i = 0; i < TITLE_PRIORITY.length; i++) {
    if (lower.includes(TITLE_PRIORITY[i])) return i;
  }
  return TITLE_PRIORITY.length; // lowest priority
}

/** Format a Date as MM/DD/YYYY — familiar US format for the spreadsheet. */
function formatDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Notification hook.
 *
 * Currently logs to the console. To add email alerts:
 *   1. npm install nodemailer
 *   2. Set ALERT_EMAIL, SMTP_HOST, SMTP_USER, SMTP_PASS in .env
 *   3. Replace the console.error below with nodemailer sendMail().
 */
function notify(message) {
  const alertEmail = process.env.ALERT_EMAIL;

  if (alertEmail) {
    // ── Optional email alert (requires nodemailer setup) ──
    // Uncomment and configure after running: npm install nodemailer
    //
    // const nodemailer = require('nodemailer');
    // const transport = nodemailer.createTransport({
    //   host: process.env.SMTP_HOST,
    //   port: Number(process.env.SMTP_PORT ?? 587),
    //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // });
    // transport.sendMail({
    //   from: process.env.SMTP_USER,
    //   to: alertEmail,
    //   subject: 'Lead-gen alert',
    //   text: message,
    // }).catch((e) => console.error('Failed to send email alert:', e.message));

    logger.warn(`[ALERT → ${alertEmail}] ${message}`);
  } else {
    logger.warn(`[ALERT] ${message}`);
    logger.warn('Set ALERT_EMAIL in .env to receive email notifications.');
  }
}

module.exports = { run, MAX_LEADS_PER_RUN };

/**
 * @typedef {object} RunSummary
 * @property {Date}        startedAt
 * @property {number}      fetched             Raw contacts returned by Apollo
 * @property {number}      duplicatesSkipped   Already-present business names
 * @property {number}      added               Rows actually written to sheet
 * @property {string|null} error               Error message if the run failed
 */
