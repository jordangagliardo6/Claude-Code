/**
 * mailer.js
 * Sends error notification emails via Gmail SMTP (App Password).
 * Only active when NOTIFY_EMAIL=true in your .env file.
 */

'use strict';

const nodemailer = require('nodemailer');

/**
 * Sends an error alert email to ALERT_EMAIL.
 * Silently logs and returns if email is disabled or credentials are missing.
 *
 * @param {string} subject  Short description of what went wrong
 * @param {string} body     Full error details
 */
async function sendErrorAlert(subject, body) {
  if (process.env.NOTIFY_EMAIL !== 'true') {
    // Email notifications disabled — just log to console
    console.error(`[Mailer] Notification suppressed (NOTIFY_EMAIL != true): ${subject}`);
    return;
  }

  const user  = process.env.SMTP_USER;
  const pass  = process.env.SMTP_PASS;
  const to    = process.env.ALERT_EMAIL;

  if (!user || !pass || !to) {
    console.error('[Mailer] Email credentials missing — skipping alert. Set SMTP_USER, SMTP_PASS, ALERT_EMAIL in .env');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from    : `"HVAC Lead Gen" <${user}>`,
      to,
      subject : `[HVAC Lead Gen] ${subject}`,
      text    : `HVAC Lead Generation — Error Report\n\n${body}\n\nTimestamp: ${new Date().toISOString()}`,
    });
    console.log(`[Mailer] Alert sent to ${to}`);
  } catch (err) {
    // Don't let mailer failure mask the original error
    console.error(`[Mailer] Failed to send alert email: ${err.message}`);
  }
}

module.exports = { sendErrorAlert };
