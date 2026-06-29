/**
 * logger.js — Error logging and optional email notifications
 *
 * All errors are written to error.log in the project root.
 * If NOTIFY_EMAIL + SMTP_USER + SMTP_PASS are set in .env, an alert email
 * is also sent via Gmail SMTP using a Gmail App Password.
 *
 * To disable email alerts, simply leave NOTIFY_EMAIL blank in .env.
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const LOG_FILE = path.join(__dirname, '..', 'error.log');

/**
 * Logs an error message to error.log and optionally emails it.
 * Never throws — logging failures must not crash the scheduler.
 *
 * @param {string} message  — human-readable description
 * @param {Error|null} err  — optional Error object for stack trace
 */
async function logError(message, err = null) {
  const timestamp = new Date().toISOString();
  const stack = err?.stack || '';
  const logLine = `[${timestamp}] ERROR: ${message}\n${stack ? stack + '\n' : ''}\n`;

  // Always write to file
  try {
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (writeErr) {
    console.error('Could not write to error.log:', writeErr.message);
  }

  // Send email if configured
  const { NOTIFY_EMAIL, SMTP_USER, SMTP_PASS } = process.env;
  if (NOTIFY_EMAIL && SMTP_USER && SMTP_PASS) {
    await sendErrorEmail({ NOTIFY_EMAIL, SMTP_USER, SMTP_PASS }, message, stack, timestamp);
  }
}

async function sendErrorEmail({ NOTIFY_EMAIL, SMTP_USER, SMTP_PASS }, message, stack, timestamp) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${SMTP_USER}>`,
      to: NOTIFY_EMAIL,
      subject: `⚠️ HVAC Lead Gen Error — ${new Date(timestamp).toLocaleDateString('en-US')}`,
      text: [
        'An error occurred during the HVAC lead generation run:',
        '',
        message,
        '',
        stack || '(no stack trace)',
        '',
        `Logged to: ${LOG_FILE}`,
        `Timestamp: ${timestamp}`,
      ].join('\n'),
    });

    console.log(`Error notification sent to ${NOTIFY_EMAIL}`);
  } catch (emailErr) {
    console.error('Failed to send error notification email:', emailErr.message);
  }
}

/**
 * Writes a plain info line to stdout (not to the error log).
 */
function logInfo(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = { logError, logInfo };
