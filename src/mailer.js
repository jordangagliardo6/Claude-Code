/**
 * Email alert helper
 *
 * Sends an error notification via Gmail SMTP when the workflow fails.
 *
 * Requires in .env:
 *   SMTP_USER  — your Gmail address
 *   SMTP_PASS  — Gmail App Password (NOT your regular password)
 *   ALERT_EMAIL — where to send the alert
 *
 * If SMTP credentials are missing, the error is only logged to console.
 * Generate an App Password: https://myaccount.google.com/apppasswords
 */

const nodemailer = require('nodemailer');

/**
 * Send an error alert email.
 *
 * @param {string} subject  - Short description of what failed
 * @param {string} details  - Full error message or stack trace
 */
async function sendErrorAlert(subject, details) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to   = process.env.ALERT_EMAIL;

  if (!user || !pass || !to) {
    console.warn('  [Alert] SMTP not configured — logging error to console only.');
    console.error(`  [Alert] Subject : ${subject}`);
    console.error(`  [Alert] Details : ${details}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  try {
    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${user}>`,
      to,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: [
        'Your HVAC lead generation workflow encountered an error.',
        '',
        `Time    : ${timestamp} ET`,
        `Subject : ${subject}`,
        '',
        'Details:',
        details,
        '',
        'Check the server logs for more context.',
      ].join('\n'),
    });
    console.log(`  Alert email sent to ${to}`);
  } catch (emailErr) {
    // Don't let a broken mailer hide the original error
    console.error(`  Failed to send alert email: ${emailErr.message}`);
  }
}

module.exports = { sendErrorAlert };
