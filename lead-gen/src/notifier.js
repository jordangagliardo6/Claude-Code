/**
 * Error notifications.
 *
 * Current implementation: logs to console + error log file.
 * To enable email alerts, install nodemailer and uncomment the SMTP block below,
 * then add SMTP_HOST / SMTP_USER / SMTP_PASS to your .env file.
 */

const logger = require('./logger');

async function notifyError(subject, detail) {
  const email = process.env.NOTIFICATION_EMAIL;

  // ── Console / file notification (always fires) ───────────────────────────
  logger.error('═══════════════════════════════════════════════════');
  logger.error(`WORKFLOW ERROR: ${subject}`);
  logger.error(detail);
  logger.error('═══════════════════════════════════════════════════');

  if (!email) {
    logger.warn('NOTIFICATION_EMAIL not set — skipping email alert.');
    return;
  }

  // ── Optional email via nodemailer ─────────────────────────────────────────
  // Uncomment this block and run:  npm install nodemailer
  //
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   host: process.env.SMTP_HOST || 'smtp.gmail.com',
  //   port: 587,
  //   secure: false,
  //   auth: {
  //     user: process.env.SMTP_USER,
  //     pass: process.env.SMTP_PASS
  //   }
  // });
  // try {
  //   await transporter.sendMail({
  //     from: process.env.SMTP_USER,
  //     to: email,
  //     subject: `[Lead Gen] ${subject}`,
  //     text: detail
  //   });
  //   logger.info(`Error notification email sent to ${email}`);
  // } catch (mailErr) {
  //   logger.error(`Could not send notification email: ${mailErr.message}`);
  // }
}

module.exports = { notifyError };
