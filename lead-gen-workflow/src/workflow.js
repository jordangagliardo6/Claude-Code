const { searchHvacLeads } = require('./apollo');
const { appendLeads }     = require('./sheets');
const logger              = require('./logger');

/**
 * Run one complete lead generation cycle:
 *   1. Pull HVAC leads from Apollo.io
 *   2. Append new (non-duplicate) leads to Google Sheets
 *   3. Return a summary object; throw on unrecoverable error
 */
async function runWorkflow() {
  const maxLeads = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
  logger.info('=== Lead generation workflow starting ===');
  logger.info(`Max leads per run: ${maxLeads}`);

  let leads, result;

  // ── Step 1: Fetch from Apollo ──────────────────────────────────────────────
  try {
    leads = await searchHvacLeads(maxLeads);
  } catch (err) {
    const msg = `Apollo.io fetch failed: ${err.message}`;
    logger.error(msg);
    await notifyError(msg);
    throw new Error(msg);
  }

  if (leads.length === 0) {
    const msg = 'Apollo.io returned 0 leads matching the current filters.';
    logger.warn(msg);
    await notifyError(msg);
    // Not a hard error — just log and exit cleanly
    return { fetched: 0, appended: 0, skipped: 0 };
  }

  // ── Step 2: Write to Google Sheets ────────────────────────────────────────
  try {
    result = await appendLeads(leads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    logger.error(msg);
    await notifyError(msg);
    throw new Error(msg);
  }

  const summary = { fetched: leads.length, ...result };
  logger.info(
    `=== Workflow complete: fetched=${summary.fetched}, appended=${summary.appended}, skipped=${summary.skipped} ===`
  );
  return summary;
}

/**
 * Send an error alert.
 * Currently logs to console and the error log file.
 * To enable email alerts, install nodemailer and fill in the block below.
 */
async function notifyError(message) {
  logger.error(`ALERT: ${message}`);

  // ── Optional email alert ──────────────────────────────────────────────────
  // Uncomment and configure to enable email notifications.
  //
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   service: 'gmail',
  //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // });
  // await transporter.sendMail({
  //   from: process.env.SMTP_USER,
  //   to: process.env.ALERT_EMAIL,
  //   subject: '[Lead Gen] Workflow Error',
  //   text: message,
  // });
  // ─────────────────────────────────────────────────────────────────────────
}

module.exports = { runWorkflow };
