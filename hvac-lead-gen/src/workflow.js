/**
 * Core workflow: fetch leads from Apollo → deduplicate → write to Google Sheets
 */

const apollo = require('./apollo');
const sheets = require('./sheets');
const logger = require('./logger');
const config = require('./config');

/**
 * Run one full lead generation cycle.
 * Called by the scheduler every morning and optionally via --run-now flag.
 *
 * @returns {{ fetched: number, withPhone: number, added: number }}
 */
async function runWorkflow() {
  logger.info('════ Lead generation workflow started ════');
  const startedAt = Date.now();

  try {
    // ── 1. Fetch from Apollo ─────────────────────────────────────────────────
    const { contacts, totalCount } = await apollo.searchContacts(
      1,
      config.maxLeadsPerRun
    );

    if (contacts.length === 0) {
      const msg = 'Apollo returned 0 results — nothing to add this run';
      logger.warn(msg);
      await notifyError(msg);
      return { fetched: 0, withPhone: 0, added: 0 };
    }

    // ── 2. Filter: must have a phone number ──────────────────────────────────
    const withPhone = contacts.filter(c => c.phone && c.phone.trim() !== '');
    const dropped   = contacts.length - withPhone.length;

    if (dropped > 0) {
      logger.info(`Dropped ${dropped} contact(s) with no phone number`);
    }

    // ── 3. Write to Google Sheets ────────────────────────────────────────────
    const added = await sheets.appendLeads(withPhone);

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    logger.success(
      `Workflow complete — ${added} new lead(s) added in ${elapsed}s`,
      { fetched: contacts.length, withPhone: withPhone.length, added }
    );

    return { fetched: contacts.length, withPhone: withPhone.length, added };
  } catch (err) {
    logger.error('Workflow failed', { message: err.message });
    await notifyError(`Lead gen workflow error: ${err.message}`);
    throw err;
  }
}

/**
 * Error notification.
 *
 * Currently logs to console + log file. To add email alerts, install nodemailer
 * and uncomment the block below — no other file needs to change.
 */
async function notifyError(message) {
  const alertEmail = process.env.ALERT_EMAIL || 'jgagliardo98@gmail.com';

  logger.error(`ALERT → ${alertEmail}: ${message}`);
  console.error(
    '\n' +
    '┌─────────────────────────────────────────────┐\n' +
    '│  LEAD GEN ALERT — check logs/workflow.log   │\n' +
    '└─────────────────────────────────────────────┘\n' +
    `  To: ${alertEmail}\n` +
    `  Message: ${message}\n`
  );

  // ── Optional: email via nodemailer ──────────────────────────────────────
  // npm install nodemailer  → then uncomment:
  //
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   service: 'gmail',
  //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // });
  // await transporter.sendMail({
  //   from: process.env.SMTP_USER,
  //   to:   alertEmail,
  //   subject: 'HVAC Lead Gen Alert',
  //   text:    message,
  // });
}

module.exports = { runWorkflow };
