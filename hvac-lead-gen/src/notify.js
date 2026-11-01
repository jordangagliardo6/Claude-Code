/**
 * Error notification helper
 *
 * Logs errors to the console. If ALERT_EMAIL is set and nodemailer is available
 * it also sends an email alert. Keeps the dependency optional so the app still
 * works without an SMTP setup — just add nodemailer and SMTP env vars when ready.
 */

const ALERT_EMAIL = process.env.ALERT_EMAIL || '';

async function sendAlert(subject, body) {
  const timestamp = new Date().toISOString();
  const fullMessage = `[${timestamp}] HVAC Lead Gen ERROR\nSubject: ${subject}\n\n${body}`;

  console.error('=== ALERT ===');
  console.error(fullMessage);
  console.error('=============');

  // Optional email via nodemailer — only activates if SMTP_HOST is configured
  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost && ALERT_EMAIL) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: ALERT_EMAIL,
        subject: `[HVAC Lead Gen] ${subject}`,
        text: fullMessage,
      });
      console.log(`Alert email sent to ${ALERT_EMAIL}`);
    } catch (emailErr) {
      console.error('Failed to send alert email:', emailErr.message);
    }
  }
}

module.exports = { sendAlert };
