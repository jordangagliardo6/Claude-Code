/**
 * notify.js — Sends an email alert when the workflow fails.
 *
 * Uses nodemailer. Configure SMTP credentials in your .env file.
 * If you use Gmail, enable "App Passwords" (not your regular password).
 * SMTP_HOST defaults to Gmail if not set.
 */
const nodemailer = require('nodemailer');
const config = require('./config');

async function notifyError(err) {
  const to = config.ALERT_EMAIL;

  // Always log to console so the error is visible even if email fails
  console.error('[Notify] Workflow error:', err.message);

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn(
      '[Notify] SMTP_USER / SMTP_PASS not set — skipping email alert.\n' +
      '  Set these in .env to receive error emails.'
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"Lead Gen Bot" <${process.env.SMTP_USER}>`,
      to,
      subject: `⚠️ HVAC Lead Gen Workflow Failed — ${new Date().toLocaleDateString()}`,
      text: [
        'The automated HVAC lead generation workflow encountered an error.',
        '',
        `Time: ${new Date().toISOString()}`,
        `Error: ${err.message}`,
        '',
        err.stack || '',
        '',
        'Check the server logs for more detail, or review your Apollo / Google Sheets credentials.',
      ].join('\n'),
    });
    console.log(`[Notify] Error email sent to ${to}.`);
  } catch (mailErr) {
    console.error('[Notify] Failed to send error email:', mailErr.message);
  }
}

module.exports = { notifyError };
