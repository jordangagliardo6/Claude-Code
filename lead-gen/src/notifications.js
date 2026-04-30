/**
 * notifications.js
 * Handles error alerting.
 *
 * Always logs to the console.
 * Sends an email if ALERT_EMAIL and SMTP_HOST are set in .env.
 *
 * Gmail quick-start:
 *   1. Enable 2-Factor Auth on your Google account.
 *   2. Generate an App Password at https://myaccount.google.com/apppasswords
 *   3. Set SMTP_USER=your@gmail.com, SMTP_PASS=<app password> in .env
 */

'use strict';

const nodemailer = require('nodemailer');

/**
 * Logs an error and optionally sends an email alert.
 *
 * @param {string} subject - Short description of the error
 * @param {string} message - Full error detail
 */
async function sendErrorNotification(subject, message) {
  const timestamp = new Date().toISOString();

  // Always surface the error to the console / log file
  console.error(`\n[ALERT] ${timestamp}`);
  console.error(`Subject : ${subject}`);
  console.error(`Message : ${message}\n`);

  const alertEmail = process.env.ALERT_EMAIL;
  const smtpHost = process.env.SMTP_HOST;

  if (!alertEmail || !smtpHost) {
    // Email not configured — console output is the only notification
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Lead Gen Bot" <${process.env.SMTP_USER}>`,
      to: alertEmail,
      subject: `[Lead Gen Alert] ${subject}`,
      text: `${message}\n\nTimestamp: ${timestamp}\n\nCheck the server logs for more details.`,
    });

    console.log(`  Alert email sent to ${alertEmail}`);
  } catch (emailErr) {
    // Don't let an email failure hide the original error
    console.error(`  Could not send alert email: ${emailErr.message}`);
  }
}

module.exports = { sendErrorNotification };
