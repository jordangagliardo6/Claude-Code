'use strict';

// Email notifications for errors and run summaries.
// Falls back to console-only if GMAIL_APP_PASSWORD is "disabled" or missing.

const nodemailer = require('nodemailer');

function isEmailEnabled() {
  const pass = process.env.GMAIL_APP_PASSWORD;
  return pass && pass !== 'disabled';
}

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

/**
 * Send an error alert. Always logs to console; also emails if configured.
 */
async function sendErrorAlert(subject, body) {
  console.error(`\n[ERROR ALERT] ${subject}\n${body}\n`);

  if (!isEmailEnabled()) {
    console.log('[Mailer] Email alerts disabled — check console output above.');
    return;
  }

  try {
    const transport = createTransport();
    await transport.sendMail({
      from: `"Lead Gen Bot" <${process.env.GMAIL_USER}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: `[Lead Gen Error] ${subject}`,
      text: `${body}\n\nTimestamp: ${new Date().toISOString()}`,
    });
    console.log(`[Mailer] Error alert emailed to ${process.env.NOTIFY_EMAIL}`);
  } catch (err) {
    console.error(`[Mailer] Failed to send email: ${err.message}`);
  }
}

/**
 * Send a run summary (called after a successful run).
 */
async function sendRunSummary({ added, skipped, total }) {
  const subject = `Lead Gen Run Complete — ${added} new leads added`;
  const body =
    `Run completed at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET\n\n` +
    `  New leads added:   ${added}\n` +
    `  Duplicates skipped: ${skipped}\n` +
    `  Total fetched from Apollo: ${total}`;

  console.log(`\n[Summary] ${subject}\n${body}\n`);

  if (!isEmailEnabled()) return;

  try {
    const transport = createTransport();
    await transport.sendMail({
      from: `"Lead Gen Bot" <${process.env.GMAIL_USER}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: `[Lead Gen] ${subject}`,
      text: body,
    });
  } catch (err) {
    console.error(`[Mailer] Failed to send summary email: ${err.message}`);
  }
}

module.exports = { sendErrorAlert, sendRunSummary };
