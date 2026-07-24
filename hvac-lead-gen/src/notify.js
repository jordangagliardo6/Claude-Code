/**
 * notify.js — Error logging and optional email alerts
 *
 * On failure, errors are always written to errors.log.
 * If GMAIL_APP_PASSWORD and NOTIFY_EMAIL are set, an email is also sent.
 *
 * To enable email alerts:
 *   1. Go to https://myaccount.google.com/apppasswords
 *   2. Create an app password for "Mail"
 *   3. Set GMAIL_APP_PASSWORD and NOTIFY_EMAIL in your .env
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const LOG_FILE = path.join(__dirname, '..', 'errors.log');

function formatTimestamp() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
}

/**
 * Logs an error to errors.log and optionally sends an email alert.
 * @param {Error|string} error
 */
async function notifyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : '';
  const timestamp = formatTimestamp();
  const logEntry = `[${timestamp}] ERROR: ${message}\n${stack}\n${'─'.repeat(60)}\n`;

  // Always write to local log file
  try {
    fs.appendFileSync(LOG_FILE, logEntry);
  } catch (fileErr) {
    console.error(`Could not write to errors.log: ${fileErr.message}`);
  }

  console.error(`\n[ALERT] Error logged to errors.log`);

  // Email alert (only if credentials are configured)
  const to       = process.env.NOTIFY_EMAIL;
  const password = process.env.GMAIL_APP_PASSWORD;
  const from     = process.env.GMAIL_FROM || process.env.NOTIFY_EMAIL;

  if (!to || !password) {
    console.error('  Email notifications not configured (NOTIFY_EMAIL or GMAIL_APP_PASSWORD missing).');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: from, pass: password },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${from}>`,
      to,
      subject: `[HVAC Lead Gen] Error at ${timestamp}`,
      text: [
        'The HVAC lead generation run failed with the following error:',
        '',
        `Time: ${timestamp}`,
        `Error: ${message}`,
        '',
        stack || '(no stack trace)',
        '',
        `Check errors.log for the full history.`,
      ].join('\n'),
    });

    console.error(`  Error notification sent to ${to}.`);
  } catch (mailErr) {
    console.error(`  Failed to send email notification: ${mailErr.message}`);
  }
}

module.exports = { notifyError };
