const nodemailer = require('nodemailer');
const config = require('./config');

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info:  (msg)       => console.log(`[${timestamp()}] INFO:  ${msg}`),
  warn:  (msg)       => console.warn(`[${timestamp()}] WARN:  ${msg}`),
  error: (msg, err)  => {
    console.error(`[${timestamp()}] ERROR: ${msg}`);
    if (err) console.error(err.stack || err);
  },
};

/**
 * Send an email alert when the workflow encounters an error.
 * If email is disabled (EMAIL_ENABLED != 'true'), logs to console instead.
 */
async function sendErrorAlert(subject, body) {
  logger.error(`Alert: ${subject}`);

  if (!config.email.enabled) {
    logger.warn('Email alerts are disabled (EMAIL_ENABLED=false). Set EMAIL_ENABLED=true in .env to enable them.');
    logger.warn(`Full error body:\n${body}`);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.email.smtpHost,
      port: config.email.smtpPort,
      secure: config.email.smtpPort === 465,
      auth: {
        user: config.email.smtpUser,
        pass: config.email.smtpPass,
      },
    });

    await transporter.sendMail({
      from: config.email.from || config.email.smtpUser,
      to: config.email.alertTo,
      subject: `[HVAC Leads Alert] ${subject}`,
      text: `HVAC Leads Workflow Error\n${'─'.repeat(40)}\n\n${body}\n\nTimestamp: ${timestamp()}`,
    });

    logger.info(`Error alert sent to ${config.email.alertTo}`);
  } catch (emailErr) {
    logger.error('Could not send email alert (check SMTP settings in .env)', emailErr);
  }
}

module.exports = { ...logger, sendErrorAlert };
