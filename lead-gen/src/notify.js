/**
 * notify.js — Error alerting
 *
 * Logs errors to console and optionally sends an email alert.
 * Email is sent only when SMTP credentials are configured.
 */

const nodemailer = require('nodemailer');

function buildTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

/**
 * Log an error and, if email is configured, send an alert.
 *
 * @param {string} subject  Short description
 * @param {Error|string} err
 */
async function alertError(subject, err) {
  const body = err instanceof Error
    ? `${err.message}\n\n${err.stack}`
    : String(err);

  console.error(`\n[LEAD-GEN ERROR] ${subject}\n${body}\n`);

  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER;
  if (!to || !from) return; // email not configured — console-only

  const transport = buildTransport();
  if (!transport) return;

  try {
    await transport.sendMail({
      from,
      to,
      subject: `[Lead Gen Alert] ${subject}`,
      text: `Timestamp: ${new Date().toISOString()}\n\n${body}`,
    });
    console.error('[notify] Alert email sent to', to);
  } catch (mailErr) {
    console.error('[notify] Failed to send alert email:', mailErr.message);
  }
}

module.exports = { alertError };
