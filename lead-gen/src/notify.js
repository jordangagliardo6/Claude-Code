'use strict';

/**
 * Error notification module
 *
 * Sends an email alert via Gmail App Password when the workflow errors out.
 * Gracefully no-ops if NOTIFY_EMAIL / GMAIL credentials are not configured.
 */

const nodemailer = require('nodemailer');

/**
 * Send an error email notification.
 *
 * @param {string} subject  Short description of what failed
 * @param {string} body     Full error details / stack trace
 */
async function notifyError(subject, body) {
  const to = process.env.NOTIFY_EMAIL;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!to || !user || !pass) {
    console.warn('[Notify] Email credentials not configured — logging error only');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: `"Lead Gen Bot" <${user}>`,
      to,
      subject: `[Lead Gen] ${subject}`,
      text: [
        `Time: ${new Date().toISOString()}`,
        '',
        body,
        '',
        '---',
        'Check the server logs for the full trace.',
      ].join('\n'),
    });
    console.log(`[Notify] Error email sent to ${to}`);
  } catch (emailErr) {
    console.error('[Notify] Failed to send error email:', emailErr.message);
  }
}

module.exports = { notifyError };
