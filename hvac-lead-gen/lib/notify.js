/**
 * Error notification helper.
 *
 * Always logs to the console. Optionally sends an email if SMTP_* and
 * ALERT_EMAIL are set in the environment.
 *
 * Gmail users: generate an App Password at https://myaccount.google.com/apppasswords
 * (requires 2-Step Verification to be enabled) and use it as SMTP_PASS.
 */

const nodemailer = require('nodemailer');

/**
 * Log an error to the console and optionally send an email alert.
 *
 * @param {string} subject  Short description of what failed
 * @param {string} body     Full error message / stack trace
 */
async function sendErrorAlert(subject, body) {
  const timestamp = new Date().toISOString();
  console.error(`\n[${timestamp}] ALERT — ${subject}\n${body}\n`);

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_EMAIL } = process.env;

  if (!SMTP_HOST || !ALERT_EMAIL || !SMTP_USER || !SMTP_PASS) {
    console.log(
      'Email alerts are not configured. ' +
      'Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and ALERT_EMAIL in .env to enable them.'
    );
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: false, // STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_USER,
      to: ALERT_EMAIL,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: `${body}\n\nTimestamp: ${timestamp}`,
    });

    console.log(`Alert email sent to ${ALERT_EMAIL}`);
  } catch (emailErr) {
    console.error(`Could not send alert email: ${emailErr.message}`);
  }
}

module.exports = { sendErrorAlert };
