/**
 * Error notification helper.
 *
 * Logs errors to the console and optionally sends an email alert via Gmail SMTP.
 * Set ALERT_EMAIL_* environment variables to enable email alerts.
 * Gmail requires an App Password (not your regular password):
 *   https://myaccount.google.com/apppasswords
 */

const nodemailer = require('nodemailer');

/**
 * Log an error and, if email is configured, send an alert email.
 *
 * @param {string} subject  Short description of the failure
 * @param {Error|string} error
 */
async function notifyError(subject, error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  const timestamp = new Date().toISOString();

  // Always log to console
  console.error(`[${timestamp}] ERROR: ${subject}`);
  console.error(message);

  // Email alert is optional — skip if env vars are not configured
  const { ALERT_EMAIL_TO, ALERT_EMAIL_FROM, ALERT_EMAIL_APP_PASSWORD } = process.env;
  if (!ALERT_EMAIL_TO || !ALERT_EMAIL_FROM || !ALERT_EMAIL_APP_PASSWORD) {
    console.warn('[notify] Email alert skipped — ALERT_EMAIL_* env vars not set.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: ALERT_EMAIL_FROM,
        pass: ALERT_EMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Generator" <${ALERT_EMAIL_FROM}>`,
      to: ALERT_EMAIL_TO,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: `Timestamp: ${timestamp}\n\n${subject}\n\n${message}`,
    });

    console.log(`[notify] Alert email sent to ${ALERT_EMAIL_TO}`);
  } catch (emailErr) {
    console.error('[notify] Failed to send alert email:', emailErr.message);
  }
}

module.exports = { notifyError };
