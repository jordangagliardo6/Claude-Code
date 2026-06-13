'use strict';
require('dotenv').config();
const nodemailer = require('nodemailer');
const log = require('./logger');

// Only sends email if all SMTP env vars are present; otherwise just logs.
async function sendAlert(subject, body) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL_FROM, ALERT_EMAIL_TO } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !ALERT_EMAIL_TO) {
    log.warn('Email alert skipped — SMTP env vars not set. Check .env.example.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: ALERT_EMAIL_FROM || SMTP_USER,
      to: ALERT_EMAIL_TO,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: body,
    });
    log.info(`Alert email sent to ${ALERT_EMAIL_TO}`);
  } catch (err) {
    log.error('Failed to send alert email:', err.message);
  }
}

module.exports = { sendAlert };
