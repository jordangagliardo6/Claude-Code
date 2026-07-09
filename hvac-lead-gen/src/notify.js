'use strict';

/**
 * Error notification module.
 *
 * Always logs to console. Also sends an email if these three env vars are set:
 *   NOTIFY_EMAIL — who to send the alert to
 *   SMTP_USER    — Gmail address to send FROM
 *   SMTP_PASS    — Gmail App Password (not your account password)
 *
 * To create a Gmail App Password:
 *   https://myaccount.google.com/apppasswords
 *   (requires 2FA to be enabled on your Google account)
 */

const nodemailer = require('nodemailer');

/**
 * Log an error and optionally email an alert.
 *
 * @param {string} subject - Short description (used as email subject line).
 * @param {string} message - Full error message or details.
 */
async function notifyError(subject, message) {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.error(`\n[ERROR ${timestamp} ET] ${subject}`);
  console.error(`  ${message}\n`);

  const { NOTIFY_EMAIL, SMTP_USER, SMTP_PASS } = process.env;

  if (!NOTIFY_EMAIL || !SMTP_USER || !SMTP_PASS) {
    console.log('  Email notification skipped (NOTIFY_EMAIL/SMTP_USER/SMTP_PASS not configured)');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `HVAC Lead Gen <${SMTP_USER}>`,
      to: NOTIFY_EMAIL,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: [
        `An error occurred during the scheduled HVAC lead generation run.`,
        ``,
        `Time: ${timestamp} ET`,
        ``,
        `Error: ${message}`,
        ``,
        `Action: Check the process logs or re-run manually with:`,
        `  cd hvac-lead-gen && npm run run-now`,
      ].join('\n'),
    });

    console.log(`  Alert sent to ${NOTIFY_EMAIL}`);
  } catch (err) {
    // Never let notification failure crash the main process
    console.error(`  Failed to send alert email: ${err.message}`);
  }
}

module.exports = { notifyError };
