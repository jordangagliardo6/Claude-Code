'use strict';

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'workflow.log');

function timestamp() {
  return new Date().toISOString();
}

function buildLine(level, message, data) {
  const base = `[${timestamp()}] [${level}] ${message}`;
  if (data !== undefined) {
    const detail = JSON.stringify(data, null, 2).replace(/\n/g, '\n         ');
    return `${base}\n         ${detail}`;
  }
  return base;
}

function persist(line) {
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // Silently ignore log-file write failures — don't crash the workflow
  }
}

const logger = {
  info(message, data) {
    const line = buildLine('INFO ', message, data);
    console.log(line);
    persist(line);
  },
  warn(message, data) {
    const line = buildLine('WARN ', message, data);
    console.warn(line);
    persist(line);
  },
  error(message, data) {
    const line = buildLine('ERROR', message, data);
    console.error(line);
    persist(line);
  },
  success(message, data) {
    const line = buildLine('OK   ', message, data);
    console.log(line);
    persist(line);
  },
};

/**
 * Send an email alert when the workflow errors out.
 * Only active when SMTP_HOST and ALERT_EMAIL are set in .env.
 * Requires: npm install nodemailer
 */
async function notifyError(subject, body) {
  if (!process.env.SMTP_HOST || !process.env.ALERT_EMAIL) return;

  try {
    // nodemailer is an optional dependency — only needed for email alerts
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.ALERT_EMAIL,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: body,
    });
    logger.info('Error notification email sent to ' + process.env.ALERT_EMAIL);
  } catch (err) {
    logger.warn('Could not send error notification email', { error: err.message });
  }
}

module.exports = logger;
module.exports.notifyError = notifyError;
