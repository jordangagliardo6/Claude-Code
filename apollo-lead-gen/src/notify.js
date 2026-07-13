// notify.js — Error and success notifications
//
// Default: logs to console only.
// To enable email alerts: install nodemailer and uncomment the email block below.
//   npm install nodemailer
// Then set NOTIFY_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in your .env

async function notifyError(context, error) {
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] LEAD GEN ERROR — ${context}: ${error.message || error}`;

  console.error(msg);

  // ── Email notification (optional) ─────────────────────────────────────────
  // Uncomment the block below and set SMTP_* env vars to receive email alerts.
  //
  // try {
  //   const nodemailer = require('nodemailer');
  //   const transporter = nodemailer.createTransport({
  //     host: process.env.SMTP_HOST,       // e.g. 'smtp.gmail.com'
  //     port: Number(process.env.SMTP_PORT) || 587,
  //     secure: false,
  //     auth: {
  //       user: process.env.SMTP_USER,     // your Gmail address
  //       pass: process.env.SMTP_PASS,     // Gmail app password (not your login password)
  //     },
  //   });
  //
  //   await transporter.sendMail({
  //     from: `"Lead Gen Bot" <${process.env.SMTP_USER}>`,
  //     to: process.env.NOTIFY_EMAIL,
  //     subject: `Lead Gen Error — Action Required`,
  //     text: `${msg}\n\nCheck the server logs for full details.`,
  //   });
  //
  //   console.log(`Error notification sent to ${process.env.NOTIFY_EMAIL}`);
  // } catch (mailErr) {
  //   console.error('Failed to send email notification:', mailErr.message);
  // }
}

async function notifySuccess(count) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] LEAD GEN SUCCESS — ${count} new lead(s) written to Google Sheets.`);
}

module.exports = { notifyError, notifySuccess };
