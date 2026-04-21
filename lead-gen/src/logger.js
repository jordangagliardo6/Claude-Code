'use strict';

require('dotenv').config();

// Lazy-loaded so the app runs without email configured.
let transporter = null;

function buildTransporter() {
  if (transporter) return transporter;
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (_) {
    // nodemailer not installed — email alerts will be skipped
    return null;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  return transporter;
}

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info(msg) {
    console.log(`[${timestamp()}] INFO  ${msg}`);
  },

  warn(msg) {
    console.warn(`[${timestamp()}] WARN  ${msg}`);
  },

  error(msg, err) {
    const detail = err ? ` — ${err.message || err}` : '';
    console.error(`[${timestamp()}] ERROR ${msg}${detail}`);
  },

  success(msg) {
    console.log(`[${timestamp()}] ✓     ${msg}`);
  },

  // Sends an email alert for errors that need human attention.
  // Falls back to console-only if email isn't configured.
  async alert(subject, body) {
    const { ALERT_EMAIL, GMAIL_USER } = process.env;
    logger.error(`ALERT: ${subject}`, null);
    if (body) console.error(body);

    if (!ALERT_EMAIL || !GMAIL_USER) {
      logger.warn('Email alerting not configured — set ALERT_EMAIL and GMAIL_USER in .env');
      return;
    }

    const t = buildTransporter();
    if (!t) return;

    try {
      await t.sendMail({
        from: GMAIL_USER,
        to: ALERT_EMAIL,
        subject: `[Lead Gen Alert] ${subject}`,
        text: body || subject,
      });
      logger.info(`Alert email sent to ${ALERT_EMAIL}`);
    } catch (e) {
      logger.error('Failed to send alert email', e);
    }
  },
};

module.exports = logger;
