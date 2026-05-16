const fs = require('fs');
const path = require('path');
const config = require('./config');

const LOG_FILE = path.resolve('./error.log');

/**
 * Write an error to error.log and console, then optionally send an email alert.
 */
async function notifyError(context, err) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ERROR in ${context}: ${err.message || err}`;

  // Always log to console
  console.error(message);

  // Append to persistent log file
  fs.appendFileSync(LOG_FILE, message + '\n', 'utf8');

  // Send email if SMTP is configured
  if (config.notifications.email && config.notifications.smtp.host) {
    try {
      await sendEmail(context, message);
    } catch (mailErr) {
      console.error('Failed to send error notification email:', mailErr.message);
    }
  }
}

async function sendEmail(context, body) {
  // nodemailer is only required when email is actually needed
  const nodemailer = require('nodemailer');
  const { host, port, user, pass } = config.notifications.smtp;

  const transporter = nodemailer.createTransporter({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"HVAC Lead Gen" <${user}>`,
    to: config.notifications.email,
    subject: `[Lead Gen ERROR] ${context}`,
    text: body,
  });

  console.log(`  Error notification sent to ${config.notifications.email}`);
}

module.exports = { notifyError };
