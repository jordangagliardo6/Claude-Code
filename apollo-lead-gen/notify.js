/**
 * notify.js — Error logging and optional email alert.
 *
 * Always writes to error.log. If NOTIFY_EMAIL and SMTP settings are present
 * in the environment, also sends an email alert via nodemailer.
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'error.log');

/**
 * Log an error to the console, to error.log, and (optionally) via email.
 *
 * @param {string} code  - Short identifier, e.g. 'APOLLO_ERROR'
 * @param {string} message - Human-readable error description
 */
async function logError(code, message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${code}] ${message}`;

  // ── Console ────────────────────────────────────────────────────────────
  console.error('\n' + '─'.repeat(60));
  console.error(`ALERT — Lead Gen Error`);
  console.error(`Code    : ${code}`);
  console.error(`Message : ${message}`);
  console.error(`Time    : ${timestamp}`);
  console.error('─'.repeat(60) + '\n');

  // ── File log ───────────────────────────────────────────────────────────
  try {
    fs.appendFileSync(LOG_FILE, entry + '\n');
  } catch (e) {
    console.error(`Could not write to error.log: ${e.message}`);
  }

  // ── Email alert (optional) ─────────────────────────────────────────────
  if (process.env.NOTIFY_EMAIL && process.env.SMTP_HOST && process.env.SMTP_USER) {
    await sendEmail(code, message, timestamp).catch((e) =>
      console.error(`Email alert failed: ${e.message}`)
    );
  }
}

/**
 * Send an email alert using nodemailer.
 * Only called when SMTP env vars are fully configured.
 *
 * @param {string} code
 * @param {string} message
 * @param {string} timestamp
 */
async function sendEmail(code, message, timestamp) {
  const nodemailer = require('nodemailer');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Lead Gen Alert" <${process.env.SMTP_USER}>`,
    to: process.env.NOTIFY_EMAIL,
    subject: `[Lead Gen] Error: ${code}`,
    text: [
      `An error occurred during the HVAC lead generation run.`,
      ``,
      `Error code : ${code}`,
      `Message    : ${message}`,
      `Time       : ${timestamp}`,
      ``,
      `Check error.log on the server for full history.`,
      `Fix the issue or review Apollo/Google Sheets access and re-run manually:`,
      `  node index.js --now`,
    ].join('\n'),
  });

  console.log(`  → Alert email sent to ${process.env.NOTIFY_EMAIL}`);
}

module.exports = { logError };
