/**
 * src/notify.js — Error notifications via email (nodemailer / Gmail SMTP).
 *
 * If email credentials are not configured, falls back to console.error only.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const nodemailer = require('nodemailer');

/**
 * Send an error alert email and always log to console.
 *
 * @param {string} subject - Short subject line
 * @param {string} body    - Full error details
 */
async function sendAlert(subject, body) {
  const fullSubject = `[HVAC Lead Gen] ${subject}`;
  console.error(`\n🚨 ALERT: ${fullSubject}`);
  console.error(body);
  console.error('─'.repeat(60));

  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  const password = process.env.ALERT_EMAIL_PASSWORD;

  if (!to || !from || !password) {
    console.warn('  Email alert skipped — ALERT_EMAIL_* vars not configured.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: from, pass: password },
    });

    await transporter.sendMail({
      from,
      to,
      subject: fullSubject,
      text: body,
    });
    console.log(`  ✓ Alert email sent to ${to}`);
  } catch (err) {
    console.error(`  ✗ Failed to send alert email: ${err.message}`);
  }
}

module.exports = { sendAlert };
