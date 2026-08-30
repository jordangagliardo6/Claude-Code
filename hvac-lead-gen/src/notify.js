'use strict';

const nodemailer = require('nodemailer');
const config = require('./config');
const logger = require('./logger');

/**
 * Send an error notification email via Gmail SMTP.
 *
 * Requires SMTP_USER and SMTP_PASS (Gmail App Password) in .env.
 * If those vars aren't set the error is only logged to console.
 *
 * @param {string} subject   Short subject line.
 * @param {string} body      Full error details.
 */
async function sendErrorNotification(subject, body) {
  // Always log — this is the fallback even if email isn't configured
  logger.error(`NOTIFICATION: ${subject}`);
  logger.error(body);

  if (!config.smtpUser || !config.smtpPass || !config.notifyEmail) {
    logger.warn(
      'Email notification skipped — SMTP_USER, SMTP_PASS, or NOTIFY_EMAIL not configured in .env'
    );
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass, // use a Gmail App Password, not your real password
      },
    });

    await transporter.sendMail({
      from: `HVAC Lead Gen <${config.smtpUser}>`,
      to: config.notifyEmail,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: [
        `An error occurred in your HVAC lead generation workflow.`,
        '',
        `Time: ${new Date().toISOString()}`,
        '',
        subject,
        '',
        body,
        '',
        '— HVAC Lead Gen Bot',
      ].join('\n'),
    });

    logger.success(`Error notification sent to ${config.notifyEmail}`);
  } catch (err) {
    // Don't let notification failures hide the original error
    logger.error('Failed to send email notification:', err.message);
  }
}

module.exports = { sendErrorNotification };
