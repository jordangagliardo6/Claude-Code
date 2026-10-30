'use strict';

/**
 * Error and status notifications.
 *
 * Always logs to console. If SMTP env vars are set, also sends an email.
 */

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (_) {
  // nodemailer is optional — email alerts disabled if missing
}

/**
 * Send an error notification (console + optional email).
 *
 * @param {string} subject - Short description of what failed
 * @param {string} details - Full error message / stack trace
 */
async function notifyError(subject, details) {
  const timestamp = new Date().toISOString();
  console.error(`\n[ERROR ${timestamp}] ${subject}`);
  console.error(details);

  await sendEmail(`[HVAC Lead Gen ERROR] ${subject}`, details);
}

/**
 * Log a successful run summary (console only — no email for green runs).
 */
function logSuccess(newLeadsAdded, totalSkipped) {
  const timestamp = new Date().toISOString();
  console.log(
    `\n[OK ${timestamp}] Run complete — added ${newLeadsAdded} new leads, skipped ${totalSkipped} duplicates.`
  );
}

// ─── Email (optional) ─────────────────────────────────────────────────────────

async function sendEmail(subject, body) {
  const {
    ALERT_EMAIL_TO,
    ALERT_EMAIL_FROM,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
  } = process.env;

  // Skip silently if email is not configured
  if (!ALERT_EMAIL_TO || !SMTP_HOST || !SMTP_USER || !SMTP_PASS || !nodemailer) {
    return;
  }

  try {
    const transporter = nodemailer.createTransporter({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: parseInt(SMTP_PORT || '587', 10) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: ALERT_EMAIL_FROM || SMTP_USER,
      to: ALERT_EMAIL_TO,
      subject,
      text: `${body}\n\n(Sent by HVAC Lead Gen at ${new Date().toISOString()})`,
    });

    console.log(`  Alert email sent to ${ALERT_EMAIL_TO}`);
  } catch (err) {
    console.error('  Failed to send alert email:', err.message);
  }
}

module.exports = { notifyError, logSuccess };
