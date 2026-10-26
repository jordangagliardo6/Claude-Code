/**
 * notify.js — Error notification via console + optional Gmail alert.
 *
 * Set NOTIFY_EMAIL (recipient), NOTIFY_EMAIL_FROM (sender Gmail),
 * and NOTIFY_EMAIL_PASSWORD (Gmail app password) in your .env to enable email.
 */

const nodemailer = require('nodemailer');

async function notifyError(message) {
  const timestamp = new Date().toISOString();

  console.error(`\n⚠️  LEAD GEN ERROR [${timestamp}]\n${message}\n`);

  const to   = process.env.NOTIFY_EMAIL;
  const from = process.env.NOTIFY_EMAIL_FROM;
  const pass = process.env.NOTIFY_EMAIL_PASSWORD;

  if (!to || !from || !pass) {
    // Email not configured — console-only notification.
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: from, pass },
    });

    await transporter.sendMail({
      from,
      to,
      subject: `⚠️ HVAC Lead Gen Error — ${new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' })}`,
      text: [
        'The automated HVAC lead generation workflow encountered an error.',
        '',
        `Error: ${message}`,
        `Time:  ${timestamp}`,
        '',
        'Please check the process logs and verify that Apollo.io and Google Sheets are reachable.',
        '',
        '— Lead Gen Workflow',
      ].join('\n'),
    });

    console.log(`Email alert sent to ${to}`);
  } catch (emailErr) {
    // Don't let a broken email config crash the main process.
    console.error(`Failed to send email alert: ${emailErr.message}`);
  }
}

module.exports = { notifyError };
