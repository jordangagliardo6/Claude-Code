// ---------------------------------------------------------------------------
// Error notification: always logs to the console, and additionally emails
// ALERT_EMAIL_TO if SMTP_* env vars are configured. Designed so a missing
// SMTP setup never breaks the workflow — it just falls back to console-only.
// ---------------------------------------------------------------------------

const nodemailer = require('nodemailer');
const config = require('../config');

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Logs an error clearly and, if SMTP is configured, emails it to
 * config.alertEmailTo so a failed run doesn't go unnoticed.
 */
async function notifyError(subject, detail) {
  const timestamp = new Date().toISOString();
  console.error(`\n[ALERT ${timestamp}] ${subject}`);
  console.error(detail instanceof Error ? detail.stack : detail);

  if (!smtpConfigured()) {
    console.error('(SMTP not configured — set SMTP_HOST/SMTP_USER/SMTP_PASS in .env to also get an email alert)\n');
    return;
  }

  if (!config.alertEmailTo) {
    console.error('(ALERT_EMAIL_TO not set in .env — skipping email alert)\n');
    return;
  }

  try {
    const transport = buildTransport();
    await transport.sendMail({
      from: process.env.SMTP_USER,
      to: config.alertEmailTo,
      subject: `[Apollo Lead Gen] ${subject}`,
      text: `${detail instanceof Error ? detail.stack : detail}\n\nTime: ${timestamp}`,
    });
    console.error(`(Alert emailed to ${config.alertEmailTo})\n`);
  } catch (emailErr) {
    console.error('Failed to send alert email:', emailErr.message);
  }
}

/**
 * Logs a routine info message (e.g. run summaries). Not emailed.
 */
function notifyInfo(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

module.exports = { notifyError, notifyInfo };
