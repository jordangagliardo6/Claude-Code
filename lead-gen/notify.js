/**
 * notify.js
 *
 * Sends an error alert email when a lead-gen run fails.
 *
 * Uses Gmail SMTP with an App Password (not your regular password).
 * Enable App Passwords at: https://myaccount.google.com/apppasswords
 * (requires 2-Step Verification to be turned on for your Google account)
 */

const nodemailer = require('nodemailer');

/**
 * Sends an error notification to NOTIFY_EMAIL.
 * Logs to console even if email fails, so there's always a local record.
 *
 * @param {string} errorMessage   Human-readable error description
 */
async function sendErrorNotification(errorMessage) {
  const toEmail = process.env.NOTIFY_EMAIL;
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  const timestamp = new Date().toISOString();
  const subject = `[HVAC Lead Gen] Run Failed — ${timestamp}`;
  const body = `The scheduled HVAC lead generation run failed at ${timestamp}.\n\nError:\n${errorMessage}\n\nCheck the process logs for full details.`;

  // Always log locally regardless of email success
  console.error(`ERROR NOTIFICATION: ${subject}`);
  console.error(body);

  if (!gmailUser || !gmailPass || !toEmail) {
    console.warn('Email notification skipped — GMAIL_USER, GMAIL_APP_PASSWORD, or NOTIFY_EMAIL not set.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    await transporter.sendMail({
      from: gmailUser,
      to: toEmail,
      subject,
      text: body,
    });

    console.log(`Error notification sent to ${toEmail}`);
  } catch (emailErr) {
    console.error('Could not send email notification:', emailErr.message);
  }
}

module.exports = { sendErrorNotification };
