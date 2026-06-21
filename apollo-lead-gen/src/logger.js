// ---------------------------------------------------------------------------
// Console logging + an optional email alert for things that need a human.
// If ALERT_EMAIL_SMTP_* env vars aren't set, alerts just print loudly to the
// console instead of throwing — the workflow should never crash because
// alerting itself is unconfigured.
// ---------------------------------------------------------------------------
const nodemailer = require('nodemailer');
const config = require('../config');

function timestamp() {
  return new Date().toISOString();
}

function info(message) {
  console.log(`[${timestamp()}] INFO  ${message}`);
}

function error(message) {
  console.error(`[${timestamp()}] ERROR ${message}`);
}

function emailIsConfigured() {
  const { to, smtpHost, smtpUser, smtpPass } = config.alerting;
  return Boolean(to && smtpHost && smtpUser && smtpPass);
}

async function sendEmailAlert(subject, body) {
  const { to, smtpHost, smtpPort, smtpUser, smtpPass } = config.alerting;
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transporter.sendMail({
    from: smtpUser,
    to,
    subject: `[Apollo Lead Gen] ${subject}`,
    text: body,
  });
}

// Call this for anything the user should know about even though no one is
// watching the console: Apollo returned nothing, the sheet write failed, etc.
async function alert(subject, body) {
  error(`ALERT: ${subject} -- ${body}`);
  if (!emailIsConfigured()) {
    error('Email alerting is not configured (see .env ALERT_EMAIL_* vars) — console log above is the only record of this error.');
    return;
  }
  try {
    await sendEmailAlert(subject, body);
    info(`Alert email sent to ${config.alerting.to}`);
  } catch (err) {
    error(`Failed to send alert email: ${err.message}`);
  }
}

module.exports = { info, error, alert };
