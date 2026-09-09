/**
 * mailer.js — Error notification emails via Nodemailer (SMTP)
 *
 * Configure SMTP settings in your .env file.
 * Gmail users: create a Gmail App Password (not your normal password).
 *   https://myaccount.google.com/apppasswords
 */

const nodemailer = require('nodemailer');

/**
 * Send an error alert email.
 *
 * @param {string} subject  Short description of the error
 * @param {string} body     Full error details / stack trace
 */
async function sendErrorAlert(subject, body) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFY_EMAIL_FROM, NOTIFY_EMAIL_TO } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error('[mailer] SMTP not configured — skipping email alert.');
    console.error('[mailer] Set SMTP_HOST, SMTP_USER, SMTP_PASS in your .env to enable alerts.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: parseInt(SMTP_PORT || '587', 10) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: NOTIFY_EMAIL_FROM || SMTP_USER,
      to: NOTIFY_EMAIL_TO || SMTP_USER,
      subject: `[Lead Generator] ${subject}`,
      text: `Apollo HVAC Lead Generator — Error Report\n\n${body}\n\nTimestamp: ${new Date().toISOString()}`,
    });
    console.log(`[mailer] Alert sent to ${NOTIFY_EMAIL_TO || SMTP_USER}`);
  } catch (err) {
    // Don't let a mailer failure crash the main process
    console.error('[mailer] Failed to send alert email:', err.message);
  }
}

module.exports = { sendErrorAlert };
