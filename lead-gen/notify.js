/**
 * notify.js — Error alert emails via Gmail SMTP
 *
 * Requires three environment variables:
 *   ALERT_EMAIL  — destination address (where you want alerts sent)
 *   SMTP_USER    — your Gmail address (the sender)
 *   SMTP_PASS    — Gmail App Password (16-char, not your normal password)
 *
 * If any of those variables are missing, the alert is skipped and a
 * warning is printed to console instead — the script keeps running.
 *
 * Gmail App Password setup:
 *   myaccount.google.com → Security → 2-Step Verification → App passwords
 */

'use strict';

const nodemailer = require('nodemailer');

/**
 * Send an error alert email.
 *
 * @param {string} subject  Short description of the failure.
 * @param {string} body     Full error message / stack trace.
 */
async function sendErrorAlert(subject, body) {
  const { ALERT_EMAIL, SMTP_USER, SMTP_PASS } = process.env;

  if (!ALERT_EMAIL || !SMTP_USER || !SMTP_PASS) {
    console.warn(
      '[notify] Email alert skipped — set ALERT_EMAIL, SMTP_USER, and SMTP_PASS in .env to enable.'
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  try {
    await transporter.sendMail({
      from   : SMTP_USER,
      to     : ALERT_EMAIL,
      subject: `[HVAC Lead Gen] ${subject}`,
      text   : [
        'Your automated HVAC lead generation run hit an error.',
        '',
        `Timestamp: ${timestamp} (Eastern)`,
        '',
        'Details:',
        '─'.repeat(60),
        body,
        '─'.repeat(60),
        '',
        'Action: Check the server console logs or re-run manually with:',
        '  cd lead-gen && node index.js --now',
      ].join('\n'),
    });
    console.log(`[notify] Alert email sent to ${ALERT_EMAIL}`);
  } catch (mailErr) {
    // Don't let email failure mask the original error
    console.error(`[notify] Failed to send alert email: ${mailErr.message}`);
  }
}

module.exports = { sendErrorAlert };
