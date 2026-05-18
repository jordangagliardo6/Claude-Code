'use strict';

const fs   = require('fs');
const path = require('path');

const LOG_DIR  = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'workflow.log');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function ts() {
  return new Date().toISOString();
}

function append(level, message) {
  const line = `[${ts()}] [${level.padEnd(7)}] ${message}\n`;
  try { fs.appendFileSync(LOG_FILE, line, 'utf8'); } catch (_) { /* non-fatal */ }
}

const logger = {
  info(msg)  { console.log(`\x1b[36m[${ts()}] INFO\x1b[0m    ${msg}`);    append('INFO',    msg); },
  warn(msg)  { console.warn(`\x1b[33m[${ts()}] WARN\x1b[0m    ${msg}`);   append('WARN',    msg); },
  error(msg, err) {
    const detail = err ? ` — ${err.message || err}` : '';
    console.error(`\x1b[31m[${ts()}] ERROR\x1b[0m   ${msg}${detail}`);
    append('ERROR', msg + detail);
  },
  success(msg) { console.log(`\x1b[32m[${ts()}] SUCCESS\x1b[0m ${msg}`);  append('SUCCESS', msg); },

  // Sends an email alert when SMTP env vars are present; otherwise warns via console.
  async notify(subject, body) {
    if (!process.env.SMTP_HOST || !process.env.NOTIFICATION_EMAIL) {
      logger.warn('Email notification skipped — SMTP not configured. See logs/workflow.log for details.');
      return;
    }
    try {
      const nodemailer = require('nodemailer');
      const transport  = nodemailer.createTransport({
        host:   process.env.SMTP_HOST,
        port:   parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transport.sendMail({
        from:    process.env.SMTP_USER,
        to:      process.env.NOTIFICATION_EMAIL,
        subject: `[Lead Gen] ${subject}`,
        text:    body,
      });
      logger.info(`Alert email sent to ${process.env.NOTIFICATION_EMAIL}`);
    } catch (e) {
      logger.error('Failed to send alert email', e);
    }
  },
};

module.exports = logger;
