/**
 * Error notification utility.
 *
 * Always logs to console. If ALERT_EMAIL_PASSWORD is set in env,
 * also sends an email via Gmail App Password (nodemailer).
 *
 * To enable email alerts:
 *   1. Go to https://myaccount.google.com/apppasswords
 *   2. Generate an App Password for "Mail"
 *   3. Set ALERT_EMAIL_PASSWORD in your .env file
 */

const nodemailer = require('nodemailer');

/**
 * Sends an error notification via console + optional email.
 *
 * @param {string} subject - Short description of the error
 * @param {string|Error} detail - Error message or Error object
 */
async function notifyError(subject, detail) {
  const message = detail instanceof Error ? detail.message : String(detail);
  const timestamp = new Date().toISOString();
  const full = `[${timestamp}] ERROR — ${subject}: ${message}`;

  console.error(full);

  const password = process.env.ALERT_EMAIL_PASSWORD;
  const toEmail = process.env.ALERT_EMAIL;
  const fromEmail = process.env.ALERT_FROM_EMAIL || toEmail;

  if (!password || !toEmail) return; // Email alerts disabled

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: fromEmail, pass: password },
    });

    await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      subject: `HVAC Lead Gen Alert: ${subject}`,
      text: `${full}\n\nCheck the console logs for more detail.`,
    });

    console.log(`Alert email sent to ${toEmail}`);
  } catch (emailErr) {
    console.error(`Failed to send alert email: ${emailErr.message}`);
  }
}

/**
 * Logs a success/info message to console.
 */
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

module.exports = { notifyError, log };
