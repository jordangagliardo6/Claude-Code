const nodemailer = require('nodemailer');
const logger = require('./logger');

/**
 * Send an error notification. Always logs to console/file.
 * Sends an email only when NOTIFY_EMAIL + SMTP_* env vars are configured.
 */
async function sendErrorNotification(subject, message) {
  // Always log regardless of email config
  logger.error(`[ALERT] ${subject} — ${message}`);

  const { NOTIFY_EMAIL, SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT, SMTP_SECURE } = process.env;

  if (!NOTIFY_EMAIL || !SMTP_HOST) {
    logger.info('Email notifications not configured. Set NOTIFY_EMAIL and SMTP_* in .env to enable.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587'),
      secure: SMTP_SECURE === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_USER,
      to: NOTIFY_EMAIL,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: [
        `An error occurred in your HVAC lead generation workflow.`,
        ``,
        `Subject : ${subject}`,
        `Detail  : ${message}`,
        `Time    : ${new Date().toISOString()}`,
        ``,
        `Check logs/workflow.log for the full trace.`,
      ].join('\n'),
    });

    logger.info(`Error notification emailed to ${NOTIFY_EMAIL}`);
  } catch (emailErr) {
    // Don't throw — a broken email setup should never crash the workflow
    logger.error('Failed to send email notification', emailErr);
  }
}

module.exports = { sendErrorNotification };
