/**
 * Error notification helpers.
 *
 * Always logs to console. Optionally sends an email alert via Gmail SMTP
 * when ALERT_EMAIL_TO / ALERT_EMAIL_APP_PASSWORD are set in .env.
 */

const nodemailer = require('nodemailer');

/**
 * Log an error and optionally email an alert.
 * @param {string} subject - Short subject line
 * @param {string} body    - Full error details
 */
async function sendErrorAlert(subject, body) {
  const fullMessage = `[HVAC Lead Workflow] ${subject}\n\n${body}`;
  console.error(fullMessage);

  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  const pass = process.env.ALERT_EMAIL_APP_PASSWORD;

  if (!to || !from || !pass) {
    // Email not configured — console log is the only notification
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: from, pass },
    });
    await transporter.sendMail({
      from,
      to,
      subject: `[HVAC Leads] ERROR: ${subject}`,
      text: fullMessage,
    });
    console.log(`[Notify] Alert email sent to ${to}`);
  } catch (emailErr) {
    console.error(`[Notify] Failed to send alert email: ${emailErr.message}`);
  }
}

module.exports = { sendErrorAlert };
