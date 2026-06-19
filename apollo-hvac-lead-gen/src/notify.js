// Error notification: always logs to console, and additionally emails
// ALERT_EMAIL if Gmail SMTP credentials are configured.
const nodemailer = require('nodemailer');

async function notifyError(subject, message) {
  console.error(`[ALERT] ${subject}\n${message}`);

  const { ALERT_EMAIL, SMTP_USER, SMTP_PASS } = process.env;
  if (!ALERT_EMAIL || !SMTP_USER || !SMTP_PASS) {
    console.error('[ALERT] Email alerts not configured (SMTP_USER/SMTP_PASS) — logged to console only.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({
      from: SMTP_USER,
      to: ALERT_EMAIL,
      subject: `[Lead Gen Workflow] ${subject}`,
      text: message,
    });
    console.error('[ALERT] Email notification sent.');
  } catch (err) {
    console.error('[ALERT] Failed to send email notification:', err.message);
  }
}

module.exports = { notifyError };
