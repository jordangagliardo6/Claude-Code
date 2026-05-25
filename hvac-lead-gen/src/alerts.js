const nodemailer = require('nodemailer');
const config = require('./config');

/**
 * Send an error alert via email (if Gmail credentials are configured)
 * and always log to the console.
 */
async function sendAlert(subject, message) {
  const timestamp = new Date().toISOString();
  const fullMessage = `[${timestamp}] ${subject}\n\n${message}`;

  // Always log to console
  console.error('\n========== ERROR ALERT ==========');
  console.error(fullMessage);
  console.error('=================================\n');

  // Optionally send email if credentials are present
  if (!config.alerts.email || !config.alerts.gmailUser || !config.alerts.gmailPassword) {
    console.log('[Alerts] Email alert skipped — ALERT_EMAIL or Gmail credentials not configured.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.alerts.gmailUser,
        pass: config.alerts.gmailPassword, // Use a Gmail App Password, not your real password
      },
    });

    await transporter.sendMail({
      from: `HVAC Lead Gen <${config.alerts.gmailUser}>`,
      to: config.alerts.email,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: fullMessage,
    });

    console.log(`[Alerts] Email alert sent to ${config.alerts.email}.`);
  } catch (err) {
    console.error(`[Alerts] Failed to send email alert: ${err.message}`);
  }
}

module.exports = { sendAlert };
