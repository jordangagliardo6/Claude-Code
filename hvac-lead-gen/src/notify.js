const nodemailer = require('nodemailer');
const logger = require('./logger');
const config = require('./config');

// Send an error alert. Always logs to console+file.
// Sends an email only when SMTP_HOST / SMTP_USER / SMTP_PASS are all set.
async function sendErrorAlert(subject, body) {
  logger.error(`ALERT — ${subject}: ${body}`);

  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    logger.warn('Email alert skipped — SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS to enable).');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_USER,
      to: config.ALERT_EMAIL,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: `${body}\n\nTimestamp: ${new Date().toISOString()}\nCheck logs/hvac-lead-gen.log for details.`,
    });

    logger.info(`Alert email sent to ${config.ALERT_EMAIL}.`);
  } catch (err) {
    logger.error(`Failed to deliver alert email: ${err.message}`);
  }
}

module.exports = { sendErrorAlert };
