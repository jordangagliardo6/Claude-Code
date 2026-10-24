/**
 * notify.js
 * Error notification helper.
 * Logs to the console and optionally sends an email alert via Gmail API.
 *
 * To enable email alerts, set NOTIFICATION_EMAIL in your .env file.
 * Email sending uses the Gmail API via the authenticated Google service account.
 * The service account must have Domain-Wide Delegation enabled if sending on
 * behalf of a user address, OR you can swap this for nodemailer + SMTP.
 */

const config = require('./config');

/**
 * Log an error to the console and, if NOTIFICATION_EMAIL is set,
 * attempt to send an email alert.
 *
 * @param {string} message - human-readable error description
 * @param {Error|null} [err] - optional original Error for stack trace
 */
async function notifyError(message, err = null) {
  const timestamp = new Date().toISOString();
  const fullMessage = `[HVAC Lead Gen ERROR @ ${timestamp}]\n${message}`;

  console.error('\n====== ERROR NOTIFICATION ======');
  console.error(fullMessage);
  if (err?.stack) console.error(err.stack);
  console.error('================================\n');

  if (!config.NOTIFICATION_EMAIL) {
    console.warn('  (NOTIFICATION_EMAIL not set — skipping email alert)');
    return;
  }

  try {
    await sendEmailAlert(config.NOTIFICATION_EMAIL, fullMessage);
    console.log(`  Alert email sent to ${config.NOTIFICATION_EMAIL}`);
  } catch (emailErr) {
    // Don't throw — email failure is secondary to the original problem
    console.error(`  Could not send alert email: ${emailErr.message}`);
    console.error(`  Please check your email setup in notify.js`);
  }
}

/**
 * Sends an alert email using the Gmail REST API.
 *
 * IMPORTANT: This requires a service account with Domain-Wide Delegation,
 * or you can replace this function body with nodemailer + SMTP credentials
 * if that's simpler for your setup.
 *
 * Nodemailer alternative (add "nodemailer" to package.json dependencies):
 *
 *   const nodemailer = require('nodemailer');
 *   const transporter = nodemailer.createTransport({
 *     host: 'smtp.gmail.com',
 *     port: 587,
 *     auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
 *   });
 *   await transporter.sendMail({
 *     from: process.env.SMTP_USER,
 *     to: email,
 *     subject: 'HVAC Lead Gen Error',
 *     text: message,
 *   });
 */
async function sendEmailAlert(email, message) {
  const { google } = require('googleapis');
  const fs = require('fs');
  const path = require('path');

  let credentials;
  if (config.GOOGLE_CREDENTIALS_JSON) {
    credentials = JSON.parse(
      Buffer.from(config.GOOGLE_CREDENTIALS_JSON, 'base64').toString('utf8')
    );
  } else {
    credentials = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, config.GOOGLE_CREDENTIALS_FILE), 'utf8')
    );
  }

  // Gmail API requires oauth2 with a user impersonation scope
  // If your service account doesn't have DWD, switch to nodemailer (see above)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
  });

  const gmail = google.gmail({ version: 'v1', auth });

  const subject = 'HVAC Lead Gen — Action Required';
  const rawMessage = [
    `To: ${email}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    message,
  ].join('\n');

  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });
}

module.exports = { notifyError };
