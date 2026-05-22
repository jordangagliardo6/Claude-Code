'use strict';

const nodemailer = require('nodemailer');

/**
 * Log an error to the console and optionally send an email alert.
 * Email is sent only when GMAIL_USER and GMAIL_APP_PASSWORD are set.
 *
 * @param {string} subject   Short subject line
 * @param {Error|string} err The error object or message
 */
async function alertError(subject, err) {
  const message = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err);

  // Always log to console so server logs capture it
  console.error(`\n❌  [HVAC Lead Gen] ${subject}`);
  console.error(message);
  console.error('─'.repeat(60));

  // Email alert — only fires if Gmail credentials are configured
  const user     = process.env.GMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD;
  const to       = process.env.NOTIFICATION_EMAIL;

  if (!user || !password || !to) {
    console.error('[notify] Email not configured — set GMAIL_USER, GMAIL_APP_PASSWORD, NOTIFICATION_EMAIL to enable.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass: password },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${user}>`,
      to,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: [
        `Time: ${new Date().toISOString()}`,
        '',
        message,
        '',
        'Check your server logs or re-run manually:',
        '  npm run run-now',
      ].join('\n'),
    });

    console.error(`[notify] Alert email sent to ${to}`);
  } catch (emailErr) {
    console.error('[notify] Failed to send email alert:', emailErr.message);
  }
}

/**
 * Log a success summary — no email needed.
 */
function logSuccess(added, skipped) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n✅  [${ts} ET] Run complete — ${added} leads added, ${skipped} duplicates skipped.`);
}

module.exports = { alertError, logSuccess };
