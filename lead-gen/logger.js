/**
 * logger.js
 * Error logging (to console + file) and optional email alerts via Gmail SMTP.
 *
 * Email alerts are enabled when both EMAIL_FROM and EMAIL_APP_PASSWORD are set.
 * If either is missing, errors are printed to the console and written to
 * lead-gen-errors.log — no emails are sent.
 *
 * To create a Gmail App Password:
 *   https://myaccount.google.com/apppasswords
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const LOG_FILE = path.join(__dirname, 'lead-gen-errors.log');

/**
 * Write an error entry to both the console and the log file.
 */
function logError(message, error = null) {
  const timestamp = new Date().toISOString();
  const stack = error?.stack ? `\n${error.stack}` : '';
  const entry = `[${timestamp}] ERROR: ${message}${stack}\n${'─'.repeat(60)}\n`;

  console.error(entry);
  fs.appendFileSync(LOG_FILE, entry, 'utf8');
}

/**
 * Send an email alert when the workflow encounters a fatal error.
 * Silently falls back to console-only logging if credentials are not configured.
 */
async function sendErrorNotification(message) {
  const emailFrom = process.env.EMAIL_FROM;
  const appPassword = process.env.EMAIL_APP_PASSWORD;

  if (!emailFrom || !appPassword) {
    console.warn(
      '[alert] Email alerts are not configured. ' +
        'Set EMAIL_FROM and EMAIL_APP_PASSWORD in .env to enable them.'
    );
    return;
  }

  const to = process.env.EMAIL_TO || emailFrom;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: emailFrom, pass: appPassword },
  });

  try {
    await transporter.sendMail({
      from: emailFrom,
      to,
      subject: '⚠️ HVAC Lead Gen Error',
      text: [
        'Your HVAC lead generation workflow encountered an error:',
        '',
        message,
        '',
        `Timestamp: ${new Date().toISOString()}`,
        `Details logged to: ${LOG_FILE}`,
      ].join('\n'),
    });
    console.log(`Error notification sent to ${to}`);
  } catch (emailErr) {
    console.error('Failed to send error notification email:', emailErr.message);
  }
}

module.exports = { logError, sendErrorNotification };
