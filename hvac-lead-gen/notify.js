/**
 * notify.js — Error notification via console log and optional email.
 *
 * Set SMTP_* env variables to enable email alerts.
 * If SMTP variables are missing, falls back to console-only logging.
 */

const nodemailer = require('nodemailer');
const config = require('./config');

/**
 * Logs an error to the console and optionally sends an email alert.
 *
 * @param {string} subject  Short description of what failed
 * @param {Error|string} err  The error object or message
 */
async function notifyError(subject, err) {
  const message = err instanceof Error ? err.stack || err.message : String(err);

  // Always log to console so it appears in any process manager (pm2, cron, etc.)
  console.error(`\n[ERROR] ${subject}`);
  console.error(message);
  console.error('─'.repeat(60));

  // Email alert is opt-in — only fires if SMTP credentials are configured
  if (!process.env.SMTP_HOST) {
    console.warn('[notify] SMTP not configured — email alert skipped.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: config.alertEmail,
      subject: `[HVAC Lead Gen] Error: ${subject}`,
      text: [
        `The HVAC lead generation workflow encountered an error.`,
        ``,
        `Subject: ${subject}`,
        `Time:    ${new Date().toISOString()}`,
        ``,
        `Details:`,
        message,
      ].join('\n'),
    });

    console.log(`[notify] Alert email sent to ${config.alertEmail}`);
  } catch (mailErr) {
    console.error('[notify] Failed to send alert email:', mailErr.message);
  }
}

module.exports = { notifyError };
