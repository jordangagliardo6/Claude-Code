/**
 * notify.js — Error notification via email
 *
 * Sends an alert email when the workflow fails (Apollo error,
 * Google Sheets write failure, no results, etc.).
 *
 * Configure SMTP settings in your .env file.
 * Gmail users: generate an App Password at
 *   https://myaccount.google.com/apppasswords
 */

'use strict';

const nodemailer = require('nodemailer');

/**
 * Send an error alert email.
 *
 * @param {string} subject - short summary (shown in email subject)
 * @param {string} body    - full error details
 */
async function sendErrorAlert(subject, body) {
  const recipient = process.env.NOTIFICATION_EMAIL;
  const smtpUser = process.env.SMTP_USER;

  if (!recipient || !smtpUser) {
    // Fall back to console if email is not configured
    console.error('⚠️  Email notification not configured. Set NOTIFICATION_EMAIL and SMTP_* in .env');
    console.error(`   Subject: ${subject}`);
    console.error(`   Body:    ${body}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: smtpUser,
      pass: process.env.SMTP_PASS,
    },
  });

  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  await transporter.sendMail({
    from: `"Lead Gen Bot" <${smtpUser}>`,
    to: recipient,
    subject: `[Lead Gen Alert] ${subject}`,
    text: [
      `Time: ${timestamp} ET`,
      '',
      body,
      '',
      '─'.repeat(60),
      'This message was sent by the HVAC Lead Generation workflow.',
      'Check lead-generation/workflow.log for more detail.',
    ].join('\n'),
  });

  console.log(`  Alert email sent to ${recipient}`);
}

module.exports = { sendErrorAlert };
