/**
 * Error notification module.
 *
 * Sends an email alert when the workflow fails (Apollo error, Sheets error, etc.).
 * Uses Gmail App Password via nodemailer — no OAuth browser flow required.
 *
 * To use a different SMTP provider, replace the `transporter` config below.
 */

'use strict';

const nodemailer = require('nodemailer');

/**
 * Send an error alert email.
 *
 * @param {string} subject  - Short description of the failure
 * @param {string} body     - Full error details (stack trace, context)
 * @param {object} config   - { gmailUser, gmailAppPassword, alertEmail }
 */
async function sendErrorAlert(subject, body, config) {
  const { gmailUser, gmailAppPassword, alertEmail } = config;

  if (!gmailUser || !gmailAppPassword) {
    // Credentials not configured — fall back to console only
    console.error('[notify] Email credentials not set. Alert not sent.');
    console.error(`[notify] SUBJECT: ${subject}`);
    console.error(`[notify] BODY:\n${body}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });

  const message = {
    from: `"HVAC Lead Gen" <${gmailUser}>`,
    to: alertEmail || gmailUser,
    subject: `[HVAC Lead Gen] ${subject}`,
    text: `Automated HVAC Lead Gen workflow error:\n\n${body}\n\nCheck the server logs for details.`,
  };

  try {
    await transporter.sendMail(message);
    console.log(`[notify] Error alert sent to ${message.to}`);
  } catch (err) {
    // Email itself failed — just log, don't throw, so the main process exits cleanly
    console.error(`[notify] Failed to send email alert: ${err.message}`);
  }
}

module.exports = { sendErrorAlert };
