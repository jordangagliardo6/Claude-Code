'use strict';
const nodemailer = require('nodemailer');

/**
 * Sends an email alert to NOTIFY_EMAIL when the workflow fails.
 * Silently logs to console if SMTP env vars aren't configured.
 */
async function sendErrorNotification(subject, body) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFY_EMAIL } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !NOTIFY_EMAIL) {
    console.warn('[notify] Email not configured — skipping alert. Set SMTP_* and NOTIFY_EMAIL in .env');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: parseInt(SMTP_PORT, 10) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${SMTP_USER}>`,
      to: NOTIFY_EMAIL,
      subject: `[HVAC Lead Gen Alert] ${subject}`,
      text: `${body}\n\nTimestamp: ${new Date().toISOString()}`,
    });

    console.log(`[notify] Alert sent to ${NOTIFY_EMAIL}`);
  } catch (err) {
    console.error('[notify] Failed to send alert email:', err.message);
  }
}

module.exports = { sendErrorNotification };
