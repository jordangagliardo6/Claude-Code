/**
 * Email alert helper using nodemailer.
 * Only sends if SMTP credentials are configured in .env.
 * Falls back to console-only logging if not configured.
 */

const nodemailer = require('nodemailer');
const logger     = require('./logger');

/**
 * Send an email alert.
 * @param {{ subject: string, body: string }} opts
 */
async function sendAlert({ subject, body }) {
  const to   = process.env.ALERT_EMAIL_TO;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);

  // Log to console regardless
  logger.warn(`ALERT: ${subject}`);
  logger.warn(body);

  if (!to || !host || !user || !pass) {
    logger.info('Email alert skipped — SMTP not configured (see .env.example)');
    return;
  }

  try {
    const transporter = nodemailer.createTransporter({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from:    user,
      to,
      subject: `[HVAC Lead Gen] ${subject}`,
      text:    body,
    });

    logger.info(`Alert email sent to ${to}`);
  } catch (err) {
    logger.error(`Failed to send alert email: ${err.message}`);
  }
}

module.exports = { sendAlert };
