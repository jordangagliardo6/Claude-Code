/**
 * Error notification helper.
 *
 * Uses Gmail (via googleapis) when NOTIFICATION_EMAIL is set.
 * Always logs to console regardless.
 */

const { google } = require('googleapis');
const config = require('../config');

/**
 * Log an error and optionally send an email notification.
 * @param {string} subject  Short summary (becomes email subject)
 * @param {string} body     Full error detail
 */
async function notifyError(subject, body) {
  const timestamp = new Date().toISOString();
  console.error(`\n[ERROR] ${timestamp}`);
  console.error(`Subject: ${subject}`);
  console.error(`Detail:\n${body}\n`);

  if (!config.notification.email) return;

  try {
    await sendEmail(
      config.notification.email,
      `[HVAC Lead Generator] ${subject}`,
      `${subject}\n\nTimestamp: ${timestamp}\n\n${body}`
    );
    console.log(`Notification email sent to ${config.notification.email}`);
  } catch (err) {
    // Email failure is non-fatal — we already logged above
    console.error(`Could not send notification email: ${err.message}`);
  }
}

/**
 * Sends a plain-text email via Gmail API using the same service account credentials.
 * The service account must have domain-wide delegation enabled, or use OAuth2 user credentials.
 * Alternatively, swap this out for nodemailer + SMTP if you prefer.
 */
async function sendEmail(to, subject, text) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
  });
  const authClient = await auth.getClient();
  const gmail = google.gmail({ version: 'v1', auth: authClient });

  const rawMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
  ].join('\n');

  const encoded = Buffer.from(rawMessage).toString('base64url');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });
}

module.exports = { notifyError };
