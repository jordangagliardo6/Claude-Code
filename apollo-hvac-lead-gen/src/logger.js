'use strict';

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const LOG_FILE = path.join(process.cwd(), 'lead-gen.log');

// ─── Public helpers ───────────────────────────────────────────────────────────

function log(message) {
  const line = `[${ts()}] INFO  ${message}`;
  console.log(line);
  writeLine(line);
}

function logError(context, err) {
  const line = `[${ts()}] ERROR ${context}: ${err.message}`;
  console.error(line);
  if (err.stack) console.error(err.stack);
  writeLine(line);
  if (err.stack) writeLine(err.stack);
}

/**
 * Sends an email alert when SMTP_HOST, SMTP_USER, SMTP_PASS, and ALERT_EMAIL
 * are all set.  Falls back to console-only if any are missing.
 */
async function sendAlert(subject, body) {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, ALERT_EMAIL } = process.env;

  // Always echo to console so errors are visible in any log aggregator
  console.error(`\n${'─'.repeat(60)}\nALERT: ${subject}\n${body}\n${'─'.repeat(60)}\n`);

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !ALERT_EMAIL) {
    // Silently skip — user hasn't configured email alerts
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT ?? '587', 10),
      secure: SMTP_SECURE === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_USER,
      to: ALERT_EMAIL,
      subject: `[Apollo Lead Gen] ${subject}`,
      text: body,
    });

    console.log(`Alert email sent to ${ALERT_EMAIL}`);
  } catch (emailErr) {
    console.error(`Could not send alert email: ${emailErr.message}`);
  }
}

// ─── Internals ────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString();
}

function writeLine(line) {
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // Never crash the main workflow because of a log-write failure
  }
}

module.exports = { log, logError, sendAlert };
