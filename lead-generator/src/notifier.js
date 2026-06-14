const nodemailer = require('nodemailer');
const logger = require('./logger');

// Sends an email alert when a run fails.
// Falls back to console-only if SMTP env vars are missing.
async function sendErrorNotification(subject, body) {
  const to = process.env.NOTIFICATION_EMAIL;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // Always log to console / file first
  logger.error(`NOTIFICATION: ${subject}`);
  logger.error(body);

  if (!to || !host || !user || !pass) {
    logger.warn('Email notification skipped — SMTP env vars not configured. See .env.example.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: { user, pass }
    });

    await transporter.sendMail({
      from: user,
      to,
      subject: `[Lead Generator] ${subject}`,
      text: `${body}\n\nTimestamp: ${new Date().toISOString()}`
    });

    logger.info(`Error notification email sent to ${to}`);
  } catch (err) {
    logger.error(`Failed to send email notification: ${err.message}`);
  }
}

module.exports = { sendErrorNotification };
