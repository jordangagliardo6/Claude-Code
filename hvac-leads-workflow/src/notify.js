/**
 * Email alert for workflow errors.
 *
 * Uses Gmail SMTP with an App Password (required if your Gmail account has 2FA).
 * Set ALERT_EMAIL_* variables in .env — if any are blank, falls back to console only.
 */

const nodemailer = require('nodemailer');

/**
 * Sends an error alert email and always logs to console.
 *
 * @param {string} subject
 * @param {string} body
 */
async function sendAlert(subject, body) {
  console.error(`\n[ALERT] ${subject}\n${body}\n`);

  const { ALERT_EMAIL_TO, ALERT_EMAIL_FROM, ALERT_EMAIL_PASSWORD } = process.env;

  // Email is optional — skip if credentials are not configured
  if (!ALERT_EMAIL_TO || !ALERT_EMAIL_FROM || !ALERT_EMAIL_PASSWORD) {
    console.warn('[notify] Email alerts not configured — set ALERT_EMAIL_* in .env to enable.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: ALERT_EMAIL_FROM, pass: ALERT_EMAIL_PASSWORD },
  });

  try {
    await transporter.sendMail({
      from: `"HVAC Lead Bot" <${ALERT_EMAIL_FROM}>`,
      to: ALERT_EMAIL_TO,
      subject: `[HVAC Leads] ${subject}`,
      text: body,
    });
    console.log(`[notify] Alert email sent to ${ALERT_EMAIL_TO}`);
  } catch (err) {
    // Email failure is secondary — don't mask the original error
    console.error(`[notify] Failed to send email alert: ${err.message}`);
  }
}

module.exports = { sendAlert };
