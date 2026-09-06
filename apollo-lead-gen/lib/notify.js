'use strict';

const nodemailer = require('nodemailer');

/**
 * Logs the error to console and optionally sends an email alert.
 * Email requires SMTP_USER and SMTP_PASS to be set in .env.
 *
 * @param {Error} err
 * @param {string} [context] - optional label like "Apollo search" or "Sheet write"
 */
async function notifyError(err, context = 'Lead generation') {
  const timestamp = new Date().toISOString();
  const message = err?.message || String(err);

  // Always log — visible in cron output / process logs
  console.error(`\n[ERROR ${timestamp}] ${context}: ${message}`);
  if (err?.stack) console.error(err.stack);

  // Email alert if SMTP credentials are configured
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFICATION_EMAIL } = process.env;
  if (!SMTP_USER || !SMTP_PASS || !NOTIFICATION_EMAIL) return;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(SMTP_PORT || '587', 10),
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_USER,
      to: NOTIFICATION_EMAIL,
      subject: `[Apollo Lead Gen] Error: ${context}`,
      text: [
        `Time: ${timestamp}`,
        `Context: ${context}`,
        `Error: ${message}`,
        '',
        err?.stack || '',
        '',
        'Check the process log for full details.',
        'The next scheduled run will retry at 7:00 AM ET tomorrow.',
      ].join('\n'),
    });

    console.error(`  Error notification sent to ${NOTIFICATION_EMAIL}`);
  } catch (emailErr) {
    // Don't let email failure mask the original error
    console.error('  (Failed to send email notification:', emailErr.message + ')');
  }
}

module.exports = { notifyError };
