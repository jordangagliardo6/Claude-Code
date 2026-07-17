'use strict';

// ─── Error Notification ───────────────────────────────────────
// Logs errors to the console and optionally sends an email alert.
// If SMTP_USER / SMTP_PASS are not set, email is skipped silently.

const nodemailer = require('nodemailer');

/**
 * Send an error alert to NOTIFICATION_EMAIL.
 * Always logs to console; email is best-effort.
 *
 * @param {string} subject  - alert subject line
 * @param {string} body     - full error detail
 */
async function sendAlert(subject, body) {
  const timestamp = new Date().toISOString();
  console.error(`\n[ALERT ${timestamp}] ${subject}`);
  console.error(body);
  console.error('─'.repeat(60));

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFICATION_EMAIL } = process.env;
  if (!SMTP_USER || !SMTP_PASS || !NOTIFICATION_EMAIL) return;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port: Number(SMTP_PORT) || 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: `"Lead Gen Bot" <${SMTP_USER}>`,
      to: NOTIFICATION_EMAIL,
      subject: `[Lead Gen] ${subject}`,
      text: `Timestamp: ${timestamp}\n\n${body}`,
    });
    console.error(`[notify] Email alert sent to ${NOTIFICATION_EMAIL}`);
  } catch (mailErr) {
    console.error(`[notify] Email send failed (${mailErr.message}) — check SMTP settings.`);
  }
}

module.exports = { sendAlert };
