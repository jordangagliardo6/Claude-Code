const nodemailer = require('nodemailer');
const { email: emailConfig } = require('./config');

/**
 * Send an error alert email via Gmail SMTP.
 * Silently skips if email credentials are not configured.
 */
async function sendAlert(subject, body) {
  // Always log to console regardless of email config
  console.error(`\n[ALERT] ${subject}\n${body}\n`);

  if (!emailConfig.from || !emailConfig.to || !emailConfig.gmailPassword) {
    // Email not configured — console log is the only notification
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailConfig.from,
      pass: emailConfig.gmailPassword, // Gmail App Password, not your account password
    },
  });

  try {
    await transporter.sendMail({
      from: emailConfig.from,
      to: emailConfig.to,
      subject: `[Lead Gen] ${subject}`,
      text: body,
    });
    console.log(`Alert email sent to ${emailConfig.to}`);
  } catch (err) {
    // Don't let email failure mask the original error
    console.error(`Failed to send alert email: ${err.message}`);
  }
}

module.exports = { sendAlert };
