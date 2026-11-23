/**
 * Error notification helper
 *
 * Logs errors to console + an error.log file, and optionally
 * sends an email via SMTP (set NOTIFY_EMAIL + SMTP_* env vars).
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'error.log');

/** Write an error entry to error.log and console. */
function logError(context, err) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ERROR in ${context}: ${err.message || err}\n`;

  console.error(message);
  fs.appendFileSync(LOG_FILE, message);
}

/** Log a successful run summary. */
function logSuccess(added, total) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] SUCCESS: added ${added} new lead(s). Sheet now has ~${total} total rows.\n`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, message);
}

/**
 * Send an error email if SMTP credentials are configured.
 * All SMTP_* env vars are optional — skipped if not set.
 */
async function sendErrorEmail(subject, body) {
  if (!process.env.NOTIFY_EMAIL || !process.env.SMTP_HOST) {
    return; // Email not configured — silent skip
  }

  try {
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
      from: process.env.SMTP_USER,
      to: process.env.NOTIFY_EMAIL,
      subject: `[HVAC Leads] ${subject}`,
      text: body,
    });

    console.log(`Notification email sent to ${process.env.NOTIFY_EMAIL}`);
  } catch (emailErr) {
    console.error('Failed to send notification email:', emailErr.message);
  }
}

module.exports = { logError, logSuccess, sendErrorEmail };
