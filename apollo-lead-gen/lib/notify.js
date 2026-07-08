/**
 * notify.js — Error notification via Gmail SMTP
 *
 * Uses nodemailer + a Gmail App Password so no third-party SMTP service
 * is needed. Set GMAIL_USER and GMAIL_APP_PASSWORD in your .env.
 *
 * To get a Gmail App Password:
 *   1. Enable 2-Step Verification: https://myaccount.google.com/security
 *   2. Go to https://myaccount.google.com/apppasswords
 *   3. Create an app password for "Mail" → copy the 16-character code
 *   4. Paste it into GMAIL_APP_PASSWORD in your .env file
 *
 * If you prefer a different SMTP provider, replace the transporter config below.
 */

'use strict';

const nodemailer = require('nodemailer');

/**
 * Send an error notification email.
 * Falls back to console.error if email credentials aren't configured — the
 * run keeps going rather than failing on a missing SMTP setup.
 *
 * @param {string} subject - Short description of the failure.
 * @param {string} body    - Full error details / stack trace.
 */
async function sendErrorNotification(subject, body) {
  const to   = process.env.NOTIFICATION_EMAIL;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  const fullSubject = `[Apollo Lead Gen] ERROR: ${subject}`;
  const timestamp   = new Date().toISOString();

  // Always log to console regardless of email success.
  console.error(`\n[NOTIFICATION] ${timestamp}`);
  console.error(`Subject: ${fullSubject}`);
  console.error(body);

  if (!to || !user || !pass) {
    console.warn(
      '[notify] Email credentials not configured — skipping email alert.\n' +
      'Set NOTIFICATION_EMAIL, GMAIL_USER, and GMAIL_APP_PASSWORD in .env to enable.'
    );
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // STARTTLS
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"Apollo Lead Gen" <${user}>`,
      to,
      subject: fullSubject,
      text: `Timestamp: ${timestamp}\n\n${body}`,
      html: `<pre style="font-family:monospace">Timestamp: ${timestamp}\n\n${body}</pre>`,
    });

    console.log(`[notify] Alert emailed to ${to}`);
  } catch (err) {
    console.error('[notify] Failed to send email alert:', err.message);
  }
}

module.exports = { sendErrorNotification };
