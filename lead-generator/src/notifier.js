const nodemailer = require('nodemailer');
const logger = require('./logger');

/**
 * Send an error notification email.
 * Silently skips if NOTIFICATION_EMAIL or SMTP credentials are not configured.
 */
async function sendErrorNotification(message) {
  const to = process.env.NOTIFICATION_EMAIL;

  if (!to) {
    // No email configured — error is already in console/log, nothing more to do
    return;
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn('Email notification skipped — SMTP_USER or SMTP_PASS not set.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Lead Generator" <${process.env.SMTP_USER}>`,
      to,
      subject: '[Lead Generator] Workflow Error',
      text: [
        'The HVAC lead generation workflow encountered a problem:',
        '',
        message,
        '',
        'Check the logs/ directory for full details.',
      ].join('\n'),
    });

    logger.info(`Error notification emailed to ${to}`);
  } catch (err) {
    // Don't throw — a failed notification should never crash the main workflow
    logger.error('Could not send email notification', err);
  }
}

module.exports = { sendErrorNotification };
