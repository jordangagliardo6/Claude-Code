const nodemailer = require('nodemailer');

function timestamp() {
  return new Date().toISOString();
}

function info(msg) {
  console.log(`[${timestamp()}] INFO  ${msg}`);
}

function warn(msg) {
  console.warn(`[${timestamp()}] WARN  ${msg}`);
}

function error(msg) {
  console.error(`[${timestamp()}] ERROR ${msg}`);
}

// Sends an email alert when a critical failure occurs.
// Requires ALERT_EMAIL_* vars in .env — silently skips if not configured.
async function sendErrorAlert(subject, body) {
  const { ALERT_EMAIL_TO, ALERT_EMAIL_FROM, ALERT_EMAIL_APP_PASSWORD } = process.env;

  if (!ALERT_EMAIL_TO || !ALERT_EMAIL_FROM || !ALERT_EMAIL_APP_PASSWORD) {
    warn('Email alerting not configured — skipping alert email. Set ALERT_EMAIL_* vars in .env to enable.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: ALERT_EMAIL_FROM,
        pass: ALERT_EMAIL_APP_PASSWORD, // Gmail App Password (not your main password)
      },
    });

    await transporter.sendMail({
      from: ALERT_EMAIL_FROM,
      to: ALERT_EMAIL_TO,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: `${body}\n\nTimestamp: ${timestamp()}`,
    });

    info(`Alert email sent to ${ALERT_EMAIL_TO}`);
  } catch (err) {
    error(`Failed to send alert email: ${err.message}`);
  }
}

module.exports = { info, warn, error, sendErrorAlert };
