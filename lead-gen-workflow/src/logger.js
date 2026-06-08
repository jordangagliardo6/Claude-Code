/**
 * logger.js
 * Writes timestamped messages to stdout and to logs/run.log.
 * On error it also writes to logs/errors.log and optionally sends an email.
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const LOGS_DIR = path.join(__dirname, '..', 'logs');

// Ensure logs directory exists at startup.
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

function timestamp() {
  return new Date().toISOString();
}

function writeLine(file, line) {
  fs.appendFileSync(path.join(LOGS_DIR, file), line + '\n', 'utf8');
}

const logger = {
  info(msg) {
    const line = `[${timestamp()}] INFO  ${msg}`;
    console.log(line);
    writeLine('run.log', line);
  },

  warn(msg) {
    const line = `[${timestamp()}] WARN  ${msg}`;
    console.warn(line);
    writeLine('run.log', line);
  },

  error(msg, err) {
    const detail = err ? `\n  ${err.stack || err.message || err}` : '';
    const line = `[${timestamp()}] ERROR ${msg}${detail}`;
    console.error(line);
    writeLine('run.log', line);
    writeLine('errors.log', line);
  },

  /**
   * Send an email alert when the workflow fails.
   * Falls back gracefully to console-only if env vars are not set.
   */
  async sendAlert(subject, body) {
    const { ALERT_EMAIL_TO, ALERT_EMAIL_FROM, GMAIL_APP_PASSWORD } = process.env;

    if (!ALERT_EMAIL_TO || !ALERT_EMAIL_FROM || !GMAIL_APP_PASSWORD) {
      logger.warn('Email alert skipped — ALERT_EMAIL_TO / ALERT_EMAIL_FROM / GMAIL_APP_PASSWORD not set.');
      logger.warn(`Alert subject: ${subject}`);
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: ALERT_EMAIL_FROM,
          pass: GMAIL_APP_PASSWORD,
        },
      });

      await transporter.sendMail({
        from: ALERT_EMAIL_FROM,
        to: ALERT_EMAIL_TO,
        subject: `[Lead Gen Alert] ${subject}`,
        text: `${body}\n\n---\nSent by lead-gen-workflow at ${timestamp()}`,
      });

      logger.info(`Alert email sent to ${ALERT_EMAIL_TO}: "${subject}"`);
    } catch (emailErr) {
      logger.error('Failed to send alert email', emailErr);
    }
  },
};

module.exports = logger;
