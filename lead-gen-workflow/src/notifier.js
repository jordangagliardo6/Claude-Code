/**
 * Error notification
 *
 * If ALERT_EMAIL and SMTP credentials are configured, sends an email alert.
 * Always logs to the console and error.log regardless.
 */

const nodemailer = require('nodemailer');
const logger = require('./logger');

async function sendAlert(subject, body) {
  const alertEmail = process.env.ALERT_EMAIL;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  // Always log — email is best-effort
  logger.error(`ALERT: ${subject} | ${body}`);

  if (!alertEmail || !smtpUser || !smtpPass) {
    logger.warn('Email alert skipped — ALERT_EMAIL / SMTP credentials not configured');
    return;
  }

  try {
    const transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"Lead Gen Bot" <${smtpUser}>`,
      to: alertEmail,
      subject: `[Lead Gen] ${subject}`,
      text: [
        `An error occurred in the HVAC lead generation workflow.`,
        '',
        `Subject: ${subject}`,
        `Detail: ${body}`,
        '',
        `Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
        '',
        'Check logs/error.log for the full stack trace.',
      ].join('\n'),
    });

    logger.info(`Alert email sent to ${alertEmail}`);
  } catch (err) {
    // Never let the mailer crash the main workflow
    logger.warn(`Could not send alert email: ${err.message}`);
  }
}

module.exports = { sendAlert };
