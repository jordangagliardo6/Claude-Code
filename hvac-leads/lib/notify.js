'use strict';

/**
 * Logging and error notification.
 *
 * All messages are printed to the console with a timestamp.
 * Errors are also emailed to NOTIFY_EMAIL (requires GMAIL_USER + GMAIL_APP_PASSWORD
 * in your .env). Email is best-effort — a failed send never throws.
 */

const nodemailer = require('nodemailer');

/**
 * Print a timestamped log line to stdout (or stderr for errors).
 * @param {string} message
 * @param {'info'|'error'} level
 */
function log(message, level = 'info') {
  const ts = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
  });
  const prefix = level === 'error' ? '[ERROR]' : '[INFO] ';
  const line = `[${ts}] ${prefix} ${message}`;

  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

/**
 * Send an error notification email.
 * Silently swallows send failures so the main workflow is never blocked.
 */
async function notifyError(message) {
  const to = process.env.NOTIFY_EMAIL;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!to || !user || !pass) {
    log('Email notification skipped — NOTIFY_EMAIL / GMAIL credentials not configured');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Bot" <${user}>`,
      to,
      subject: '⚠️ HVAC Lead Gen — Run Failed',
      text: [
        'Your automated HVAC lead generation run encountered an error:',
        '',
        message,
        '',
        'Please check the server logs or run  node index.js --now  manually to retry.',
      ].join('\n'),
    });

    log(`Error notification sent to ${to}`);
  } catch (err) {
    log(`Failed to send error email: ${err.message}`, 'error');
  }
}

module.exports = { log, notifyError };
