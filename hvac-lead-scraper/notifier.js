/**
 * Error notification module.
 *
 * Sends an email via Gmail (App Password) when the scraper fails.
 * If SMTP credentials aren't configured, errors are logged to console only.
 *
 * To enable email alerts:
 *   1. Go to https://myaccount.google.com/apppasswords
 *   2. Create an App Password for "Mail"
 *   3. Set SMTP_USER=your@gmail.com and SMTP_PASS=<app-password> in .env
 */

const nodemailer = require('nodemailer');

async function notify(message) {
  const recipientEmail = process.env.NOTIFICATION_EMAIL;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  // Always log — this is the fallback if email isn't configured
  console.error(`[ERROR NOTIFICATION] ${new Date().toISOString()} — ${message}`);

  if (!recipientEmail || !smtpUser || !smtpPass) {
    console.error(
      'Email alert skipped: NOTIFICATION_EMAIL, SMTP_USER, or SMTP_PASS is not set in .env'
    );
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `HVAC Lead Scraper <${smtpUser}>`,
      to: recipientEmail,
      subject: `⚠️ HVAC Lead Scraper Error — ${new Date().toLocaleDateString()}`,
      text: [
        'Your HVAC Lead Scraper encountered an error and needs attention.',
        '',
        `Error: ${message}`,
        '',
        `Time: ${new Date().toISOString()}`,
        '',
        'Check the server logs for full details.',
      ].join('\n'),
    });

    console.log(`Error notification sent to ${recipientEmail}`);
  } catch (emailErr) {
    console.error(`Failed to send email notification: ${emailErr.message}`);
  }
}

module.exports = { notify };
