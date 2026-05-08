'use strict';

require('dotenv').config();
const nodemailer = require('nodemailer');
const logger = require('./logger');

/**
 * Send an error alert.
 *
 * If SMTP_HOST and NOTIFICATION_EMAIL are configured in .env, the alert is
 * delivered via email. Otherwise the error is logged to console + log file
 * (which is always safe and requires no setup).
 *
 * @param {string} subject  Short headline for the alert
 * @param {string} body     Full error details
 */
async function sendAlert(subject, body) {
  // Always log — this is the fallback that requires zero config.
  logger.error(`ALERT — ${subject}\n${body}`);

  if (!isEmailConfigured()) {
    logger.warn(
      'Email alert not sent (SMTP_HOST or NOTIFICATION_EMAIL not configured). ' +
      'Check the console / log file above for details.'
    );
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
      from:    process.env.SMTP_FROM || process.env.SMTP_USER,
      to:      process.env.NOTIFICATION_EMAIL,
      subject: `[HVAC Lead Gen] ${subject}`,
      text:    body,
    });

    logger.log(`Alert email sent to ${process.env.NOTIFICATION_EMAIL}`);
  } catch (emailErr) {
    // Email failure is non-fatal — we already logged the original error above.
    logger.error(`Failed to send alert email: ${emailErr.message}`);
  }
}

/**
 * Send a success summary (optional — only fires when email is configured).
 */
async function sendSummary(added, skipped) {
  if (!isEmailConfigured()) return;

  const subject = `Daily run complete — ${added} new leads added`;
  const body = [
    `HVAC Lead Gen — Daily Run Summary`,
    `Date: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
    ``,
    `New leads added:    ${added}`,
    `Duplicates skipped: ${skipped}`,
  ].join('\n');

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
      from:    process.env.SMTP_FROM || process.env.SMTP_USER,
      to:      process.env.NOTIFICATION_EMAIL,
      subject: `[HVAC Lead Gen] ${subject}`,
      text:    body,
    });
  } catch (_) {
    // Summary emails are best-effort; don't surface failures.
  }
}

function isEmailConfigured() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.NOTIFICATION_EMAIL
  );
}

module.exports = { sendAlert, sendSummary };
