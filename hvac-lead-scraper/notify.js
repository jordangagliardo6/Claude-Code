/**
 * notify.js — Error logging and optional email alerts.
 *
 * Errors always go to:
 *   1. Console (stderr)
 *   2. error.log file next to this script
 *
 * If SMTP_HOST / SMTP_USER / SMTP_PASS are set in .env, errors also
 * trigger an email to NOTIFICATION_EMAIL.
 *
 * To use Gmail SMTP: enable 2FA on your Google account, then create an
 * App Password at https://myaccount.google.com/apppasswords and use it
 * as SMTP_PASS.
 */

const fs   = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'error.log');

/**
 * Log an error to console and error.log.
 * If SMTP credentials are configured, also send an email alert.
 */
async function logError(label, err) {
  const ts  = new Date().toISOString();
  const msg = `[${ts}] ERROR — ${label}\n${err?.stack || err?.message || String(err)}\n\n`;

  process.stderr.write(msg);
  fs.appendFileSync(LOG_FILE, msg, 'utf8');

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    await sendEmailAlert(label, msg).catch(e =>
      process.stderr.write(`[notify] email send failed: ${e.message}\n`)
    );
  }
}

async function sendEmailAlert(subject, body) {
  // Lazy-require nodemailer only when email alerts are configured
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    process.stderr.write('[notify] nodemailer not installed — run: npm install nodemailer\n');
    return;
  }

  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from:    process.env.SMTP_USER,
    to:      process.env.NOTIFICATION_EMAIL,
    subject: `[HVAC Lead Scraper] Error: ${subject}`,
    text:    body,
  });
}

/**
 * Log a successful run summary to run.log.
 */
function logSuccess(added, skipped) {
  const ts  = new Date().toISOString();
  const msg = `[${ts}] SUCCESS — added ${added} leads, skipped ${skipped} duplicates/no-phone\n`;
  process.stdout.write(msg);
  fs.appendFileSync(path.join(__dirname, 'run.log'), msg, 'utf8');
}

module.exports = { logError, logSuccess };
