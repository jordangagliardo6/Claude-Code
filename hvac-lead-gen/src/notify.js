/**
 * notify.js — Error notification handler
 *
 * Always logs to console. Sends an email alert when SMTP credentials
 * are configured via environment variables.
 *
 * Required env vars for email alerts:
 *   NOTIFICATION_EMAIL  — recipient address
 *   SMTP_USER           — Gmail account used to send
 *   SMTP_PASS           — Gmail App Password (16-char, not account password)
 */

const nodemailer = require('nodemailer');

/**
 * Log an error and optionally send an email notification.
 *
 * @param {string} subject - Short subject line (shown as push banner)
 * @param {string} body    - Detailed error message
 * @returns {Promise<void>}
 */
async function sendErrorNotification(subject, body) {
  // Always print to console so server logs capture it
  console.error(`\n[ERROR ALERT] ${subject}`);
  console.error(body);
  console.error('');

  const to = process.env.NOTIFICATION_EMAIL;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!to || !smtpUser || !smtpPass) {
    console.warn(
      '[Notify] Email not sent — set NOTIFICATION_EMAIL, SMTP_USER, ' +
      'and SMTP_PASS in .env to enable email alerts.'
    );
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${smtpUser}>`,
      to,
      subject: `[Lead Gen Alert] ${subject}`,
      text: [
        `Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
        '',
        body,
        '',
        '— HVAC Lead Gen Workflow',
      ].join('\n'),
    });

    console.log(`[Notify] Alert email sent to ${to}.`);
  } catch (err) {
    // Don't throw — notification failure shouldn't crash the main process
    console.error(`[Notify] Failed to send email: ${err.message}`);
  }
}

module.exports = { sendErrorNotification };
