'use strict';

const nodemailer = require('nodemailer');

function timestamp() {
  return new Date().toISOString();
}

function info(msg) {
  console.log(`[${timestamp()}] INFO  ${msg}`);
}

function warn(msg) {
  console.warn(`[${timestamp()}] WARN  ${msg}`);
}

function error(msg, err) {
  const detail = err ? ` — ${err.message || err}` : '';
  console.error(`[${timestamp()}] ERROR ${msg}${detail}`);
}

// Send an email alert when something goes wrong.
// Requires SMTP_* and ALERT_EMAIL env vars; silently skips if not configured.
async function sendAlert(subject, body) {
  const { ALERT_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!ALERT_EMAIL || !SMTP_USER || !SMTP_PASS) {
    warn('Email alert skipped — ALERT_EMAIL / SMTP credentials not configured.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(SMTP_PORT || '587', 10),
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_USER,
      to: ALERT_EMAIL,
      subject: `[Lead Gen Alert] ${subject}`,
      text: body,
    });

    info(`Alert email sent to ${ALERT_EMAIL}: ${subject}`);
  } catch (e) {
    error('Failed to send alert email', e);
  }
}

module.exports = { info, warn, error, sendAlert };
