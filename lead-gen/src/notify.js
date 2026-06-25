// ─────────────────────────────────────────────────────────────────
// notify.js — Error notification via email (or console fallback).
//
// Uses Nodemailer with any SMTP provider.
// Gmail setup: generate an App Password (16 chars) at:
//   https://myaccount.google.com/apppasswords
// Then set SMTP_USER, SMTP_PASS, and ALERT_EMAIL in .env.
//
// If email isn't configured, errors are still printed to the console
// so you can see them in server logs / systemd journal / PM2.
// ─────────────────────────────────────────────────────────────────

const nodemailer = require('nodemailer');

/**
 * Log an error to the console and optionally send an email alert.
 *
 * @param {string} errorMessage - Human-readable description of what went wrong.
 */
async function sendErrorNotification(errorMessage) {
  // Always log — visible in server output, PM2 logs, systemd journal, etc.
  console.error(`\n[ERROR] ${new Date().toISOString()}`);
  console.error(`        ${errorMessage}`);

  const to   = process.env.ALERT_EMAIL;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!to || !user || !pass) {
    console.warn('[NOTIFY] Email alert skipped — ALERT_EMAIL / SMTP_USER / SMTP_PASS not set.');
    return;
  }

  const host = process.env.SMTP_HOST ?? 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT ?? '587', 10);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: { user, pass },
  });

  const body = [
    'Your automated HVAC lead generation workflow hit an error and could not complete.',
    '',
    `Time:  ${new Date().toISOString()}`,
    `Error: ${errorMessage}`,
    '',
    'Check the server logs for more details.',
    'The workflow will try again at the next scheduled run (7 AM Eastern).',
  ].join('\n');

  try {
    await transporter.sendMail({
      from: `"Lead Gen Bot" <${user}>`,
      to,
      subject: '[ACTION NEEDED] HVAC Lead Gen failed',
      text: body,
    });
    console.log(`[NOTIFY] Alert email sent to ${to}`);
  } catch (mailErr) {
    // Don't let a mail failure mask the original error
    console.error(`[NOTIFY] Failed to send email alert: ${mailErr.message}`);
  }
}

module.exports = { sendErrorNotification };
