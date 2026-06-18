// Logs errors to the console and, if SMTP is configured, emails an alert.

const nodemailer = require('nodemailer');
const config = require('../config');

function logError(context, error) {
  console.error(`[${new Date().toISOString()}] ERROR (${context}):`, error.message || error);
}

function logInfo(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function alert(context, error) {
  logError(context, error);

  const { to, from, smtpHost, smtpUser, smtpPass } = config.alert;
  if (!to || !smtpHost || !smtpUser || !smtpPass) {
    logInfo('Email alert skipped: SMTP/ALERT_EMAIL_* env vars not fully configured.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: config.alert.smtpPort,
      secure: config.alert.smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: from || smtpUser,
      to,
      subject: `[Lead Gen Workflow] Failed: ${context}`,
      text: `The HVAC lead generation workflow failed.\n\nContext: ${context}\nError: ${
        error.message || error
      }\n\nCheck the workflow manually before the next scheduled run.`,
    });
    logInfo(`Alert email sent to ${to}.`);
  } catch (mailError) {
    logError('sending alert email', mailError);
  }
}

module.exports = { alert, logInfo, logError };
