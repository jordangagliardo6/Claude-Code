const nodemailer = require('nodemailer');
const config = require('./config');
const logger = require('./logger');

// Send an alert email when a workflow step fails.
// Falls back to a console warning if email is not configured.
async function sendAlert(subject, body) {
  // Always log the alert regardless of email config
  logger.warn(`[Alert] ${subject}: ${body}`);

  if (!config.notification.enabled) {
    logger.warn('[Notifier] EMAIL_NOTIFICATIONS=false — set it to true in .env to receive email alerts');
    return;
  }

  if (!config.notification.alertEmail) {
    logger.warn('[Notifier] ALERT_EMAIL not set — skipping email notification');
    return;
  }

  try {
    // nodemailer v8: createTransport is async
    const transporter = await nodemailer.createTransport({
      host: config.notification.smtp.host,
      port: config.notification.smtp.port,
      secure: config.notification.smtp.port === 465,
      auth: {
        user: config.notification.smtp.user,
        pass: config.notification.smtp.pass,
      },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${config.notification.smtp.user}>`,
      to: config.notification.alertEmail,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: `${body}\n\nCheck logs/workflow.log for details.`,
    });

    logger.info(`[Notifier] Alert email sent to ${config.notification.alertEmail}`);
  } catch (err) {
    logger.error('[Notifier] Failed to send alert email', err);
  }
}

module.exports = { sendAlert };
