'use strict';

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.resolve(__dirname, '../run.log');

/**
 * Write a timestamped message to stdout and to run.log.
 *
 * @param {string} msg
 */
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) {
    // Non-fatal — logging failure shouldn't crash the workflow
  }
}

/**
 * Send an error notification email via Gmail SMTP.
 * Requires GMAIL_USER and GMAIL_APP_PASSWORD env vars.
 *
 * Falls back to console-only logging if credentials are missing.
 *
 * @param {string} subject
 * @param {string} body
 */
async function sendErrorEmail(subject, body) {
  const to = process.env.NOTIFICATION_EMAIL;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass || !to) {
    log(`[EMAIL SKIPPED] No Gmail credentials configured. Subject: ${subject}`);
    log(`[ERROR DETAILS] ${body}`);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"Lead Gen Bot" <${user}>`,
      to,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: [
        `An error occurred in the HVAC lead generation workflow.`,
        '',
        subject,
        '',
        body,
        '',
        `Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
        `Log file: ${LOG_FILE}`,
      ].join('\n'),
    });

    log(`Error notification sent to ${to}`);
  } catch (emailErr) {
    log(`Failed to send error email: ${emailErr.message}`);
  }
}

module.exports = { log, sendErrorEmail };
