const nodemailer = require('nodemailer');
const config = require('./config');
const log = require('./logger');

// Sends an error alert email if SMTP credentials are configured.
// Falls back gracefully to console-only if they aren't.
async function sendErrorAlert(subject, body) {
  const { smtpHost, smtpUser, smtpPass, smtpPort, email } = config.notification;

  log.error(`ALERT — ${subject}: ${body}`);

  if (!smtpHost || !smtpUser || !smtpPass) {
    log.warn('SMTP not configured — error logged to console only. Set SMTP_* env vars for email alerts.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpUser,
      to: email,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: `${body}\n\nTimestamp: ${new Date().toISOString()}\n\nCheck logs/ directory for full details.`,
    });

    log.info(`Alert email sent to ${email}`);
  } catch (err) {
    log.error(`Failed to send alert email: ${err.message}`);
  }
}

module.exports = { sendErrorAlert };
