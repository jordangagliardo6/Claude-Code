/**
 * Notification module — logs errors prominently and optionally sends email alerts.
 *
 * Email alerts require SMTP settings in .env (see .env.example).
 * Without SMTP settings configured, errors are console-only.
 */

'use strict';

async function sendNotification(subject, message) {
  // Always log to console so errors are visible in any hosting environment
  const border = '═'.repeat(60);
  console.error(`\n${border}`);
  console.error(`  ALERT: ${subject}`);
  console.error(`  ${message}`);
  console.error(`${border}\n`);

  // Send email only when SMTP is configured
  const { ALERT_EMAIL, SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT } = process.env;
  if (!ALERT_EMAIL || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return; // Email not configured — console log above is sufficient
  }

  try {
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: false, // true for port 465, false for 587
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"Lead Gen Bot" <${SMTP_USER}>`,
      to: ALERT_EMAIL,
      subject: `[Lead Gen] ${subject}`,
      text: [
        `Time: ${new Date().toISOString()}`,
        '',
        message,
        '',
        '-- Automated Lead Generation Workflow',
      ].join('\n'),
    });

    console.log(`  Email alert sent to ${ALERT_EMAIL}.`);
  } catch (emailErr) {
    // Don't throw — email failure is secondary; the workflow error was already logged
    console.error(`  Failed to send email alert: ${emailErr.message}`);
  }
}

module.exports = { sendNotification };
