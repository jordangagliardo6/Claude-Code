/**
 * notify.js
 * Error notification helper.
 *
 * Always logs to console. If SMTP credentials are configured in .env,
 * also sends an email alert to NOTIFY_EMAIL.
 */

const nodemailer = require('nodemailer');

/**
 * Log an error and optionally email it.
 * @param {string} subject  Short description (used as email subject)
 * @param {string|Error} err  Error message or Error object
 */
async function notifyError(subject, err) {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  const fullMessage = `[hvac-lead-generator] ${subject}\n\n${message}`;

  // Always print to console so server logs capture it
  console.error('─'.repeat(60));
  console.error(fullMessage);
  console.error('─'.repeat(60));

  // Email alert is optional — only fires when SMTP is fully configured
  const { NOTIFY_EMAIL, SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!NOTIFY_EMAIL || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) return;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? SMTP_USER,
      to: NOTIFY_EMAIL,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: fullMessage,
    });

    console.log(`[Notify] Error email sent to ${NOTIFY_EMAIL}`);
  } catch (mailErr) {
    // Don't let a broken email config hide the original error
    console.error(`[Notify] Could not send error email: ${mailErr.message}`);
  }
}

module.exports = { notifyError };
