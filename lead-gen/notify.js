/**
 * notify.js — Error alerting
 *
 * Sends an email alert when Apollo search or Google Sheets write fails.
 * If SMTP is not configured, falls back to console.error only.
 */

const nodemailer = require('nodemailer');

/**
 * Send an error alert email and always log to console.
 *
 * @param {string} subject - email subject line
 * @param {string} body - email body text
 */
async function sendAlert(subject, body) {
  const timestamp = new Date().toISOString();
  const fullMessage = `[HVAC Lead Gen Alert] ${timestamp}\n\n${subject}\n\n${body}`;

  console.error('─'.repeat(60));
  console.error(fullMessage);
  console.error('─'.repeat(60));

  const alertEmail = process.env.ALERT_EMAIL;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!alertEmail || !smtpUser || !smtpPass) {
    // Email not configured — console log is the only alert
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${smtpUser}>`,
      to: alertEmail,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: fullMessage,
    });

    console.log(`Alert email sent to ${alertEmail}`);
  } catch (emailErr) {
    console.error(`Failed to send alert email: ${emailErr.message}`);
  }
}

module.exports = { sendAlert };
