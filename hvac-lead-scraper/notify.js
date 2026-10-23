/**
 * Error notification module
 *
 * Sends an email alert when the lead scraper fails.
 * Uses Gmail + an App Password — see README for setup instructions.
 *
 * Required env vars:
 *   NOTIFICATION_EMAIL   - Where to send alerts (your Gmail address)
 *   GMAIL_APP_PASSWORD   - 16-character Google App Password (NOT your Gmail password)
 *
 * If email is not configured, errors are printed to console only.
 */

const nodemailer = require('nodemailer');

async function sendErrorNotification(subject, body) {
  const email = process.env.NOTIFICATION_EMAIL;
  const appPassword = process.env.GMAIL_APP_PASSWORD;

  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const fullBody = `${body}\n\n──────────────────────\nTime: ${timestamp} ET\nSource: HVAC Lead Scraper (hvac-lead-scraper/index.js)`;

  // Always log to console
  console.error('\n══════════════════════════════════════════');
  console.error(`[ERROR NOTIFICATION] ${subject}`);
  console.error(fullBody);
  console.error('══════════════════════════════════════════\n');

  if (!email || !appPassword) {
    console.warn('[notify] NOTIFICATION_EMAIL or GMAIL_APP_PASSWORD not set — email skipped.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: email,
        pass: appPassword,
      },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Scraper" <${email}>`,
      to: email,
      subject: `[HVAC Lead Scraper] ${subject}`,
      text: fullBody,
    });

    console.log(`[notify] Alert email sent to ${email}`);
  } catch (err) {
    console.error(`[notify] Failed to send email alert: ${err.message}`);
    console.error('[notify] Check GMAIL_APP_PASSWORD — see README for setup instructions.');
  }
}

module.exports = { sendErrorNotification };
