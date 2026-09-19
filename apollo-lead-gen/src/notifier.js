// ─────────────────────────────────────────────────────────────────────────────
// notifier.js — Email alert on error (optional; falls back to console)
// ─────────────────────────────────────────────────────────────────────────────

const nodemailer = require('nodemailer');

async function sendErrorAlert(subject, message) {
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  const pass = process.env.GMAIL_APP_PASSWORD;

  // Always log to console regardless of email config
  console.error(`\n[ERROR ALERT] ${subject}\n${message}\n`);

  if (!to || !from || !pass) {
    console.warn('  Email alert skipped: ALERT_EMAIL_TO / ALERT_EMAIL_FROM / GMAIL_APP_PASSWORD not set.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: from, pass },
  });

  await transporter.sendMail({
    from: `"Lead Gen Bot" <${from}>`,
    to,
    subject: `[Lead Gen] ${subject}`,
    text: `${message}\n\nCheck the server logs for full details.`,
  });

  console.log(`  Alert email sent to ${to}`);
}

module.exports = { sendErrorAlert };
