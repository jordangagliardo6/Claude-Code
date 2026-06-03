'use strict';

require('dotenv').config();
const nodemailer = require('nodemailer');

// ─── Console logging ──────────────────────────────────────────────────────────

function logError(context, err) {
  const ts = new Date().toISOString();
  console.error(`\n[ERROR ${ts}] ${context}`);
  console.error(err?.message || err);
  if (err?.stack) console.error(err.stack);
}

function logInfo(message) {
  const ts = new Date().toISOString();
  console.log(`[INFO  ${ts}] ${message}`);
}

// ─── Email alert ──────────────────────────────────────────────────────────────

/**
 * Sends an email alert when the workflow fails.
 * Only runs if all four SMTP_* env vars are set.
 */
async function sendAlert(subject, body) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !ALERT_EMAIL_TO) {
    // Email not configured — console log is the fallback
    console.warn('[Notify] SMTP not configured. Skipping email alert.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${SMTP_USER}>`,
      to: ALERT_EMAIL_TO,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: body,
    });

    console.log(`[Notify] Alert email sent to ${ALERT_EMAIL_TO}`);
  } catch (err) {
    console.error('[Notify] Failed to send alert email:', err.message);
  }
}

module.exports = { logError, logInfo, sendAlert };
