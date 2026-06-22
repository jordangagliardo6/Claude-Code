const nodemailer = require('nodemailer');
const config = require('./config');

function logError(context, error) {
  console.error(`\n[${new Date().toISOString()}] ERROR in ${context}:`);
  console.error(error.stack || error.message || error);
}

function logInfo(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Emails an alert via Gmail SMTP if ALERT_EMAIL_USER/APP_PASSWORD are set.
// Falls back to console-only logging when email isn't configured, so the
// workflow never crashes just because alerting wasn't set up.
async function alert(subject, message) {
  console.error(`\n*** ALERT: ${subject} ***\n${message}\n`);

  const { user, appPassword, to } = config.alerting;
  if (!user || !appPassword || !to) {
    console.error('(Email alerting not configured -- set ALERT_EMAIL_USER, ' +
      'ALERT_EMAIL_APP_PASSWORD, ALERT_EMAIL_TO in .env to enable email alerts.)');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass: appPassword },
    });

    await transporter.sendMail({
      from: user,
      to,
      subject: `[Apollo Lead Gen] ${subject}`,
      text: message,
    });

    console.log('Alert email sent.');
  } catch (err) {
    console.error('Failed to send alert email:', err.message);
  }
}

module.exports = { logError, logInfo, alert };
