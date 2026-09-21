/**
 * Simple logger with timestamps and optional email alerting.
 */

const config = require('./config');

function timestamp() {
  return new Date().toISOString();
}

function log(msg) {
  console.log(`[${timestamp()}] ${msg}`);
}

function warn(msg) {
  console.warn(`[${timestamp()}] WARN: ${msg}`);
}

function error(msg, err) {
  const detail = err ? `\n  ${err.stack || err.message || err}` : '';
  console.error(`[${timestamp()}] ERROR: ${msg}${detail}`);
}

/**
 * Log an error and optionally send an email alert.
 * Falls back gracefully if SMTP is not configured — just logs to console.
 */
async function alertError(subject, body) {
  error(subject);
  console.error(body);

  if (!config.alerts.email) return;

  // Only attempt SMTP if nodemailer is installed
  try {
    const nodemailer = require('nodemailer');
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      console.error('[ALERT] SMTP_USER/SMTP_PASS not set — skipping email alert. Add them to .env to enable email alerts.');
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpUser,
      to: config.alerts.email,
      subject: `[HVAC Leads] ${subject}`,
      text: body,
    });

    console.log(`[ALERT] Email sent to ${config.alerts.email}`);
  } catch (e) {
    console.error('[ALERT] Failed to send email alert:', e.message);
    console.error('[ALERT] To enable email alerts, install nodemailer: npm install nodemailer');
    console.error('[ALERT] Then add SMTP_USER and SMTP_PASS to your .env file.');
  }
}

module.exports = { log, warn, error, alertError };
