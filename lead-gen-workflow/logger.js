/**
 * logger.js — simple error logging + notification helper
 *
 * Writes errors to error.log in the project root and prints a clear
 * console alert with the NOTIFY_EMAIL so you know where to look.
 *
 * To wire up email notifications replace the stub in notifyByEmail() with
 * Nodemailer, SendGrid, or any transactional email service you already use.
 */

const fs     = require('fs');
const path   = require('path');
const config = require('./config');

const LOG_FILE = path.join(__dirname, 'error.log');

/**
 * Log an error code + message to both the console and error.log.
 *
 * @param {string} code    - Short uppercase identifier, e.g. "NO_RESULTS"
 * @param {string} message - Human-readable description of what went wrong.
 */
function logError(code, message) {
  const timestamp = new Date().toISOString();
  const entry     = `${timestamp} [${code}] ${message}`;

  // Always write to the log file
  fs.appendFileSync(LOG_FILE, entry + '\n');

  // Prominent console output so it's hard to miss in cron logs
  console.error('\n' + '!'.repeat(60));
  console.error(`  ERROR: ${code}`);
  console.error('!'.repeat(60));
  console.error(message);
  console.error(`\nFull log: ${LOG_FILE}`);
  console.error(`Notify:   ${config.NOTIFY_EMAIL}`);
  console.error('!'.repeat(60) + '\n');

  // Optional: send an email (implement below to activate)
  notifyByEmail(code, message).catch(() => { /* best-effort */ });
}

/**
 * Send an email alert.  Stub — replace with Nodemailer or your mailer of
 * choice.  Example using Nodemailer + Gmail app password:
 *
 *   npm install nodemailer
 *
 *   const nodemailer = require('nodemailer');
 *   const transport  = nodemailer.createTransport({
 *     service: 'gmail',
 *     auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASS },
 *   });
 *   await transport.sendMail({
 *     from:    process.env.GMAIL_USER,
 *     to:      config.NOTIFY_EMAIL,
 *     subject: `[HVAC Lead Gen] Error: ${code}`,
 *     text:    message,
 *   });
 */
async function notifyByEmail(code, message) {
  // STUB — implement email here if you want push alerts
}

/**
 * Trim the log file to the most recent maxLines lines so it never
 * grows unbounded.  Call once per run.
 *
 * @param {number} maxLines
 */
function trimLog(maxLines = 500) {
  if (!fs.existsSync(LOG_FILE)) return;
  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
  if (lines.length > maxLines) {
    fs.writeFileSync(LOG_FILE, lines.slice(-maxLines).join('\n') + '\n');
  }
}

module.exports = { logError, trimLog };
