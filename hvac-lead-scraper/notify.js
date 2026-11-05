/**
 * notify.js – Error notification helper.
 * Logs to console and optionally sends an email alert via SMTP.
 * Email is sent only when SMTP_HOST, SMTP_USER, and SMTP_PASS are all set.
 */
const config = require('./config');

async function sendErrorAlert(subject, body) {
  const { email, smtp } = config.notification;

  // Always log to console regardless of email config
  console.error(`\n[ALERT] ${subject}`);
  console.error(body);
  console.error('');

  if (!smtp.host || !smtp.user || !smtp.pass || !email) {
    // Email not configured – console log is the only notification
    return;
  }

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    await transporter.sendMail({
      from: smtp.user,
      to: email,
      subject: `[HVAC Scraper] ${subject}`,
      text: body,
    });

    console.log(`[Notify] Error alert sent to ${email}`);
  } catch (err) {
    console.error(`[Notify] Failed to send email alert: ${err.message}`);
  }
}

module.exports = { sendErrorAlert };
