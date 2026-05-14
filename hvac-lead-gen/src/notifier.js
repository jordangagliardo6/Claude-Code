/**
 * Error notification helper
 *
 * Sends an email alert when the workflow fails. Falls back to console-only
 * logging if SMTP credentials are not configured.
 */

const nodemailer = require('nodemailer');
const logger = require('./logger');

async function sendErrorAlert(subject, body) {
  const to = process.env.NOTIFICATION_EMAIL;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  // Always log to console/file regardless of email setup
  logger.error(`ALERT — ${subject}`, null);
  logger.error(body, null);

  if (!to || !smtpUser || !smtpPass) {
    logger.warn('SMTP not configured — alert logged to console/file only');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false, // STARTTLS
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${smtpUser}>`,
      to,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: `${body}\n\nCheck the logs directory for details.`,
    });

    logger.info(`Alert email sent to ${to}`);
  } catch (err) {
    logger.error('Failed to send alert email', err);
  }
}

module.exports = { sendErrorAlert };
