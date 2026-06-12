/**
 * notifier.js — Error alerting.
 *
 * Always logs to console. Optionally sends an email via SMTP if credentials
 * are configured in the environment.
 *
 * Gmail users: create an App Password at
 *   https://myaccount.google.com/apppasswords
 * and use it as SMTP_PASS (not your regular account password).
 */

const nodemailer = require('nodemailer');
const config = require('./config');

/**
 * Log an error and optionally email an alert.
 *
 * @param {string} subject  Short description (becomes the email subject)
 * @param {string} message  Full error details
 */
async function sendErrorAlert(subject, message) {
  // Always surface errors in the console so they appear in any process log
  console.error(`\n[ALERT] ${subject}`);
  console.error(message);

  const to = config.notificationEmail;
  if (!to) {
    console.warn('[notifier] No NOTIFICATION_EMAIL set — skipping email alert.');
    return;
  }

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn(
      '[notifier] SMTP not configured — email alert skipped.\n' +
      '           Set SMTP_HOST, SMTP_USER, and SMTP_PASS to enable email alerts.'
    );
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: user,
      to,
      subject: `[Lead Gen Alert] ${subject}`,
      text: message,
      html: `<pre style="font-family:monospace;font-size:13px">${message}</pre>`,
    });

    console.log(`[notifier] Alert email sent to ${to}`);
  } catch (emailErr) {
    // Don't throw — the SMTP failure is secondary to the original error
    console.error(`[notifier] Failed to send alert email: ${emailErr.message}`);
  }
}

module.exports = { sendErrorAlert };
