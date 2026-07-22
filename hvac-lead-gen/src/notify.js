/**
 * notify.js — Error notification layer.
 *
 * Always logs to the console. Optionally sends email via Gmail SMTP
 * when SMTP_USER and SMTP_PASS env vars are set.
 *
 * To enable email alerts:
 *   1. Set SMTP_USER to your Gmail address
 *   2. Set SMTP_PASS to a Gmail App Password (NOT your regular password)
 *      → https://myaccount.google.com/apppasswords
 *   3. Set NOTIFICATION_EMAIL to where alerts should be delivered
 */

async function notifyError(subject, details) {
  const divider = '─'.repeat(60);
  console.error(`\n${divider}`);
  console.error(`[ALERT] ${subject}`);
  console.error(details);
  console.error(`${divider}\n`);

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      await sendEmail(subject, details);
    } catch (err) {
      // Email failure is secondary — never let it crash the main process
      console.error('Could not send email notification:', err.message);
    }
  } else {
    console.error('(Email alerts are disabled. Set SMTP_USER + SMTP_PASS to enable them.)');
  }
}

async function sendEmail(subject, body) {
  const nodemailer = require('nodemailer');

  const to = process.env.NOTIFICATION_EMAIL || process.env.SMTP_USER;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS, // Gmail App Password
    },
  });

  await transporter.sendMail({
    from: `"HVAC Lead Gen" <${process.env.SMTP_USER}>`,
    to,
    subject: `[HVAC Lead Gen] ${subject}`,
    text: `${body}\n\nTimestamp: ${new Date().toISOString()}`,
  });

  console.log(`  ✓ Email alert sent to ${to}`);
}

module.exports = { notifyError };
