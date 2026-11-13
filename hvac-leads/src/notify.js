/**
 * Error notification helpers.
 * Currently logs to console + writes to error.log.
 * To add email, uncomment the nodemailer block and install: npm i nodemailer
 */

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'error.log');

/**
 * Log an error both to the console and to error.log on disk.
 * @param {string} context  short label, e.g. "Apollo search"
 * @param {Error|string} err
 */
function logError(context, err) {
  const timestamp = new Date().toISOString();
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : '';

  const line = `[${timestamp}] ERROR in ${context}: ${message}\n${stack}\n${'─'.repeat(60)}\n`;

  console.error(line);

  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (writeErr) {
    console.error('Could not write to error.log:', writeErr.message);
  }
}

/**
 * Log a successful run summary.
 */
function logSuccess(added, skipped) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] RUN OK — added: ${added}, skipped (duplicates): ${skipped}\n`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (_) {}
}

/*
 * ── Optional email alerts via nodemailer ──────────────────────────────────────
 * To enable:
 *   1. npm install nodemailer
 *   2. Uncomment the block below
 *   3. Set SMTP_USER and SMTP_PASS in your .env
 *
 * const nodemailer = require('nodemailer');
 *
 * async function sendErrorEmail(context, err) {
 *   const transporter = nodemailer.createTransport({
 *     service: 'gmail',
 *     auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
 *   });
 *   await transporter.sendMail({
 *     from: process.env.SMTP_USER,
 *     to: process.env.NOTIFICATION_EMAIL,
 *     subject: `[HVAC Leads] Error in ${context}`,
 *     text: err instanceof Error ? err.stack : String(err),
 *   });
 * }
 */

module.exports = { logError, logSuccess };
