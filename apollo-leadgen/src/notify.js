/**
 * Error logging + optional email alerting. If SMTP_* and ALERT_EMAIL env
 * vars are not configured, alerts simply log clearly to the console — the
 * workflow never fails just because alerting isn't set up.
 */

let nodemailer;
try {
  // Optional dependency: only required if you actually want email alerts.
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

function logError(context, err) {
  console.error(`[${new Date().toISOString()}] ERROR (${context}):`, err && err.message ? err.message : err);
}

async function sendAlert(subject, message) {
  logError(subject, message);

  const { ALERT_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  const emailConfigured = ALERT_EMAIL && SMTP_HOST && SMTP_USER && SMTP_PASS;

  if (!emailConfigured) {
    console.warn('Email alerting is not configured (set ALERT_EMAIL + SMTP_* in .env) — logged to console only.');
    return;
  }

  if (!nodemailer) {
    console.warn('nodemailer is not installed — run `npm install` to enable email alerts. Logged to console only.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to: ALERT_EMAIL,
      subject: `[Apollo Lead Gen] ${subject}`,
      text: message,
    });
  } catch (emailErr) {
    logError('sendAlert (email send failed)', emailErr);
  }
}

module.exports = { logError, sendAlert };
