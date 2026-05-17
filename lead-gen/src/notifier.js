/**
 * Error notification module
 *
 * Attempts to send an email alert via nodemailer (Gmail SMTP).
 * Falls back to console-only if email credentials are not configured.
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const log = require('./logger');

async function sendAlert(subject, body) {
  log.error(`ALERT: ${subject}`);
  log.error(body);

  const { SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO, ALERT_EMAIL_FROM } = process.env;

  if (!SMTP_USER || !SMTP_PASS || !ALERT_EMAIL_TO) {
    log.warn('Email alert skipped — SMTP credentials not configured (console log above is the alert).');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: ALERT_EMAIL_FROM || SMTP_USER,
      to: ALERT_EMAIL_TO,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: `${body}\n\nLog file: ${log.LOG_FILE}`,
    });
    log.info(`Alert email sent to ${ALERT_EMAIL_TO}`);
  } catch (err) {
    log.error(`Failed to send alert email: ${err.message}`);
  }
}

module.exports = { sendAlert };
