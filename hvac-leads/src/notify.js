'use strict';

/**
 * Error notification helper
 *
 * Always logs to the console.
 * If SMTP_* env vars are configured, also sends an email alert.
 */

const nodemailer = require('nodemailer');

/**
 * Sends an error notification.
 * @param {string} subject - Short description of the error
 * @param {string} body    - Full error detail / stack trace
 */
async function notifyError(subject, body) {
  const timestamp = new Date().toISOString();
  const fullSubject = `[HVAC Lead Generator] ERROR: ${subject}`;
  const fullBody = `${timestamp}\n\n${body}`;

  // Always log to console
  console.error(`\n${'='.repeat(60)}`);
  console.error(fullSubject);
  console.error('='.repeat(60));
  console.error(fullBody);
  console.error('='.repeat(60) + '\n');

  // Email only if SMTP env vars are present
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !ALERT_EMAIL) return;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Generator" <${SMTP_USER}>`,
      to: ALERT_EMAIL,
      subject: fullSubject,
      text: fullBody,
    });

    console.error(`Email alert sent to ${ALERT_EMAIL}`);
  } catch (emailErr) {
    // Don't throw — the original error was already logged above
    console.error('Failed to send email alert:', emailErr.message);
  }
}

module.exports = { notifyError };
