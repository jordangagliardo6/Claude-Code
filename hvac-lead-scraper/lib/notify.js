/**
 * Error notification module.
 *
 * If NOTIFICATION_EMAIL, SMTP_USER, and SMTP_PASS are set in .env,
 * errors are emailed via Gmail. Otherwise they're logged to console only.
 *
 * To use Gmail: create an App Password at https://myaccount.google.com/apppasswords
 * and set SMTP_PASS to that 16-character password (not your Gmail login password).
 */

const nodemailer = require('nodemailer');

/**
 * Logs an error to console and optionally emails it.
 * @param {Error|string} error
 * @param {string} context - Short description of where the error occurred
 */
async function sendErrorNotification(error, context = '') {
  const message = error?.message || String(error);
  const timestamp = new Date().toISOString();

  // Always log to console
  console.error(`\n[${timestamp}] ERROR — ${context}`);
  console.error(message);
  if (error?.stack) console.error(error.stack);

  const to = process.env.NOTIFICATION_EMAIL;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!to || !smtpUser || !smtpPass) {
    // Email not configured — console log is the fallback, already done above
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpUser,
      to,
      subject: `[HVAC Lead Scraper] Error on ${new Date().toLocaleDateString()}`,
      text: [
        'The HVAC lead scraper encountered an error and may need manual attention.',
        '',
        `Timestamp: ${timestamp}`,
        `Context:   ${context}`,
        `Error:     ${message}`,
        '',
        error?.stack || '',
        '',
        'Check the server logs for more detail.',
      ].join('\n'),
    });

    console.log(`Error notification sent to ${to}`);
  } catch (emailErr) {
    console.error('Failed to send error email:', emailErr.message);
  }
}

module.exports = { sendErrorNotification };
