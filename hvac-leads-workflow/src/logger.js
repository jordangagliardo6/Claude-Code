const nodemailer = require('nodemailer');
const config = require('./config');

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info(msg) {
    console.log(`[${timestamp()}] INFO  ${msg}`);
  },

  warn(msg) {
    console.warn(`[${timestamp()}] WARN  ${msg}`);
  },

  error(msg, err) {
    const detail = err ? ` — ${err.message || err}` : '';
    console.error(`[${timestamp()}] ERROR ${msg}${detail}`);
    if (err?.stack) console.error(err.stack);
  },

  // Send an email alert when something goes wrong.
  // Falls back to console-only if SMTP credentials are not configured.
  async alert(subject, body) {
    logger.error(`ALERT: ${subject}\n${body}`);

    const { smtp, toEmail, fromEmail } = config.alerts;
    if (!smtp.host || !smtp.user || !smtp.pass) {
      logger.warn('SMTP not configured — skipping email alert. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env to enable.');
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      });

      await transporter.sendMail({
        from: fromEmail,
        to: toEmail,
        subject: `[HVAC Leads Workflow] ${subject}`,
        text: body,
      });

      logger.info(`Alert email sent to ${toEmail}`);
    } catch (err) {
      logger.error('Failed to send alert email', err);
    }
  },
};

module.exports = logger;
