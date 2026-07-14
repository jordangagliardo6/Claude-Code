/**
 * Error notification module
 *
 * Always writes to error.log.
 * Optionally sends an email alert if SMTP credentials are configured in .env.
 *
 * To enable email alerts, set all four in .env:
 *   NOTIFICATION_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *
 * For Gmail: use an App Password (not your regular password).
 * Create one at: myaccount.google.com/apppasswords
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const LOG_PATH = path.resolve('./error.log');

/**
 * Log an error to file and optionally email it.
 *
 * @param {string} message   Short description of what went wrong
 * @param {Error}  [err]     Original error object for stack trace
 */
async function logError(message, err) {
  const timestamp = new Date().toISOString();
  const stack = err ? `\n${err.stack}` : '';
  const entry = `[${timestamp}] ${message}${stack}\n${'─'.repeat(60)}\n`;

  fs.appendFileSync(LOG_PATH, entry);
  console.error(`[Notify] Error logged to ${LOG_PATH}`);

  const emailTo   = process.env.NOTIFICATION_EMAIL;
  const smtpHost  = process.env.SMTP_HOST;
  const smtpPort  = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser  = process.env.SMTP_USER;
  const smtpPass  = process.env.SMTP_PASS;

  if (!emailTo || !smtpHost || !smtpUser || !smtpPass) {
    console.warn(
      '[Notify] Email not configured — add NOTIFICATION_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS to .env to enable email alerts.'
    );
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Generator" <${smtpUser}>`,
      to: emailTo,
      subject: `[HVAC Lead Gen] Error: ${message.slice(0, 80)}`,
      text: [
        'Your HVAC lead generation workflow encountered an error.',
        '',
        `Time: ${timestamp}`,
        `Error: ${message}`,
        stack ? `\nStack:\n${stack}` : '',
        '',
        `Full log: ${LOG_PATH}`,
      ].join('\n'),
    });

    console.log(`[Notify] Alert email sent to ${emailTo}`);
  } catch (mailErr) {
    console.error(`[Notify] Failed to send email: ${mailErr.message}`);
  }
}

module.exports = { logError };
