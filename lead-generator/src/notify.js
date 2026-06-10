/**
 * notify.js — Error notification via email (nodemailer / Gmail SMTP)
 *
 * If SMTP credentials aren't configured, errors are printed to console only.
 * To enable email alerts, set SMTP_HOST, SMTP_USER, SMTP_PASS, and
 * NOTIFICATION_EMAIL in your .env file.
 */

'use strict';

const nodemailer = require('nodemailer');

/**
 * Send an error-alert email and always log to console as well.
 *
 * @param {string} subject  – short description of the problem
 * @param {string} body     – full error message / details
 */
async function sendErrorNotification(subject, body) {
  const timestamp = new Date().toISOString();
  const fullMessage = `${body}\n\nTimestamp: ${timestamp}`;

  // Always print — visible in any hosting platform's log stream
  console.error(`\n[ALERT] ${subject}\n${fullMessage}\n`);

  const to = process.env.NOTIFICATION_EMAIL;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!to || !smtpUser || !smtpPass) {
    // Email not configured — console output above is the only notification
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: false, // STARTTLS on port 587
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpUser,
      to,
      subject: `[HVAC Lead Generator] ${subject}`,
      text: fullMessage,
    });

    console.log(`  Error notification sent to ${to}`);
  } catch (emailErr) {
    // Don't throw — a notification failure shouldn't mask the original error
    console.error(`  Could not send email notification: ${emailErr.message}`);
  }
}

module.exports = { sendErrorNotification };
