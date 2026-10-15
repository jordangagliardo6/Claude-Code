/**
 * notifications.js
 *
 * Sends email alerts when a run errors out.
 * Configure via env vars — if they're missing, alerts are logged only.
 *
 * Required env vars for email alerts:
 *   ALERT_EMAIL   — recipient address
 *   SMTP_HOST     — e.g. smtp.gmail.com
 *   SMTP_USER     — sender address
 *   SMTP_PASS     — app password (for Gmail, generate at myaccount.google.com/apppasswords)
 *   SMTP_PORT     — (optional) defaults to 587
 */

const nodemailer = require('nodemailer');

async function sendErrorAlert(subject, body) {
  const emailTo = process.env.ALERT_EMAIL;
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!emailTo || !smtpHost || !smtpUser || !smtpPass) {
    console.warn(
      '[ALERT] Email not configured — error logged above.\n' +
        '        Set ALERT_EMAIL, SMTP_HOST, SMTP_USER, SMTP_PASS in .env to enable email alerts.'
    );
    return;
  }

  const port = parseInt(process.env.SMTP_PORT || '587', 10);

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure: port === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  try {
    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${smtpUser}>`,
      to: emailTo,
      subject: `[HVAC Lead Gen Alert] ${subject}`,
      text: `${body}\n\nTimestamp: ${new Date().toISOString()}`,
    });
    console.log(`Alert email sent to ${emailTo}`);
  } catch (err) {
    // Don't let a notification failure crash the process
    console.error(`Could not send alert email: ${err.message}`);
  }
}

module.exports = { sendErrorAlert };
