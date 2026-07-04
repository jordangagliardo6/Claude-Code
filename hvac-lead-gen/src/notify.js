'use strict';

const nodemailer = require('nodemailer');

/**
 * Send an error alert email, then also log to console.
 * If email credentials are not configured, only logs to console.
 *
 * @param {string} subject - email subject / log label
 * @param {string} body    - error detail
 */
async function sendAlert(subject, body) {
  const timestamp = new Date().toISOString();
  const fullMessage = `[${timestamp}] ${subject}\n\n${body}`;

  // Always log — visible in cron logs, pm2 logs, etc.
  console.error('\n' + '═'.repeat(60));
  console.error('ALERT:', subject);
  console.error(body);
  console.error('═'.repeat(60) + '\n');

  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!to || !from || !pass) {
    console.warn('[notify] Email credentials not configured — alert logged to console only.');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: from, pass },
  });

  try {
    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${from}>`,
      to,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: fullMessage,
    });
    console.log(`[notify] Alert email sent to ${to}`);
  } catch (err) {
    console.error('[notify] Failed to send alert email:', err.message);
  }
}

/**
 * Log a successful run summary (no email — just console).
 */
function logSuccess(added, skipped, total) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Run complete — added: ${added}, skipped (dup/no-phone): ${skipped}, searched: ${total}`);
}

module.exports = { sendAlert, logSuccess };
