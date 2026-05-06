'use strict';

/**
 * Error notification: tries email (nodemailer/Gmail), falls back to console.
 *
 * To enable email alerts:
 *   ALERT_EMAIL_TO   — recipient address
 *   ALERT_EMAIL_FROM — sender Gmail address
 *   ALERT_EMAIL_PASSWORD — Gmail App Password (not your main password)
 *   Generate an App Password: https://myaccount.google.com/apppasswords
 */

const nodemailer = require('nodemailer');
const logger     = require('./logger');

/**
 * Send an error alert.
 * Always logs to console; also emails if ALERT_EMAIL_TO is configured.
 *
 * @param {string} subject  Short description of the failure
 * @param {string} body     Full error details
 */
async function sendAlert(subject, body) {
  // Always log locally regardless of email config
  logger.error('─── ALERT ───────────────────────────────────');
  logger.error(`Subject : ${subject}`);
  logger.error(`Details : ${body}`);
  logger.error('─────────────────────────────────────────────');

  const to       = process.env.ALERT_EMAIL_TO;
  const from     = process.env.ALERT_EMAIL_FROM;
  const password = process.env.ALERT_EMAIL_PASSWORD;

  if (!to || !from || !password) {
    logger.warn('Email alert skipped — ALERT_EMAIL_* env vars not configured.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: from, pass: password },
    });

    await transporter.sendMail({
      from,
      to,
      subject: `[HVAC Lead Generator] ${subject}`,
      text: [
        `Time: ${new Date().toISOString()}`,
        '',
        body,
        '',
        '— HVAC Lead Generator (automated alert)',
      ].join('\n'),
    });

    logger.info(`Alert email sent to ${to}`);
  } catch (err) {
    // Email failure is non-fatal — we already logged above
    logger.warn(`Could not send alert email: ${err.message}`);
  }
}

module.exports = { sendAlert };
