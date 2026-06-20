// notify.js
//
// Error alerting. Always logs to the console; additionally emails
// ALERT_EMAIL if SMTP env vars are present. This is the function that
// fires when Apollo returns no results or the Google Sheets write fails,
// so the user knows to check the workflow manually.

const nodemailer = require('nodemailer');
const logger = require('./logger');

async function sendAlert(subject, message) {
  logger.error(`ALERT: ${subject} -- ${message}`);

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL } = process.env;

  if (!SMTP_HOST || !ALERT_EMAIL) {
    logger.warn('Email alerting is not configured (missing SMTP_HOST / ALERT_EMAIL) -- alert was only logged above.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });

    await transporter.sendMail({
      from: SMTP_USER || ALERT_EMAIL,
      to: ALERT_EMAIL,
      subject: `[Lead Gen Workflow] ${subject}`,
      text: message,
    });

    logger.info(`Alert email sent to ${ALERT_EMAIL}.`);
  } catch (err) {
    logger.error(`Failed to send alert email: ${err.message}`);
  }
}

module.exports = { sendAlert };
