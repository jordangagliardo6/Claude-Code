// ============================================================
// Notification Helper
// Logs errors to console and optionally sends an email alert.
// To enable email: set ALERT_EMAIL_TO, ALERT_EMAIL_FROM,
// and ALERT_EMAIL_PASSWORD in your .env file.
// ============================================================

require('dotenv').config();

async function sendErrorAlert(subject, body) {
  const to       = process.env.ALERT_EMAIL_TO;
  const from     = process.env.ALERT_EMAIL_FROM;
  const password = process.env.ALERT_EMAIL_PASSWORD;

  // Always log to console regardless of email config.
  console.error(`\n[HVAC Scraper ERROR] ${subject}\n${body}\n`);

  // Skip email if credentials not configured.
  if (!to || !from || !password) return;

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: from, pass: password },
    });

    await transporter.sendMail({
      from,
      to,
      subject: `[HVAC Lead Scraper] ${subject}`,
      text: body,
    });

    console.error(`Alert email sent to ${to}.`);
  } catch (emailErr) {
    console.error(`Failed to send alert email: ${emailErr.message}`);
  }
}

module.exports = { sendErrorAlert };
