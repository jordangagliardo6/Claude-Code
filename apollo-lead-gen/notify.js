/**
 * Error notification module
 *
 * Always logs to console. If SMTP credentials are present in .env,
 * also sends an email to NOTIFICATION_EMAIL so you know to check manually.
 *
 * To enable email alerts:
 *   1. Set SMTP_HOST, SMTP_USER, SMTP_PASS in your .env
 *   2. For Gmail, create an App Password at https://myaccount.google.com/apppasswords
 *      (requires 2-Step Verification to be on)
 */

'use strict';

const nodemailer = require('nodemailer');

/**
 * Log an error and optionally send an email notification.
 *
 * @param {Error}  error
 * @param {string} [context] - short description of where the error happened
 */
async function sendErrorNotification(error, context = 'Unknown') {
  const timestamp = new Date().toISOString();
  const body = [
    '============================',
    ' APOLLO LEAD GEN — ERROR',
    '============================',
    `Time:    ${timestamp}`,
    `Context: ${context}`,
    `Error:   ${error.message}`,
    ...(error.stack ? ['', 'Stack trace:', error.stack] : []),
  ].join('\n');

  // Always print to console so server logs always have the full error
  console.error('\n[ERROR NOTIFICATION]\n' + body + '\n');

  const smtpConfigured =
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.NOTIFICATION_EMAIL;

  if (!smtpConfigured) {
    console.log('(Email notifications not configured — see .env.example)');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from:    `"Lead Gen Alert" <${process.env.SMTP_USER}>`,
      to:      process.env.NOTIFICATION_EMAIL,
      subject: `[Lead Gen] Error on ${new Date().toLocaleDateString('en-US')} — check manually`,
      text:    body,
    });

    console.log(`Error notification sent to ${process.env.NOTIFICATION_EMAIL}`);
  } catch (emailErr) {
    // Email failure is non-fatal — we already logged to console above
    console.error('Could not send email notification:', emailErr.message);
  }
}

module.exports = { sendErrorNotification };
