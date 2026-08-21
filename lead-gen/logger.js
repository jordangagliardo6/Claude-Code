/**
 * Simple logger that writes timestamped lines to the console and to a log file.
 * Errors are prominently marked and can trigger a notification.
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'lead-gen.log');
const MAX_LOG_BYTES = 5 * 1024 * 1024; // Rotate when log exceeds 5 MB

function timestamp() {
  return new Date().toISOString();
}

function writeLine(prefix, message) {
  const line = `[${timestamp()}] ${prefix} ${message}`;
  console.log(line);
  try {
    // Rotate log if it's gotten large
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_BYTES) {
        fs.renameSync(LOG_FILE, LOG_FILE + '.bak');
      }
    }
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (_) {
    // Log write failure is non-fatal
  }
}

const log = {
  info: (msg) => writeLine('[INFO]', msg),
  warn: (msg) => writeLine('[WARN]', msg),
  error: (msg) => writeLine('[ERROR]', msg),
  success: (msg) => writeLine('[OK]', msg),
};

/**
 * Send a basic error notification.
 * Currently writes to the log file and prints a prominent console message.
 * Extend this function to add email alerts (e.g., via nodemailer or SendGrid).
 */
async function sendErrorNotification(subject, body) {
  const fullMessage = `\n${'='.repeat(60)}\nNOTIFICATION: ${subject}\n${body}\n${'='.repeat(60)}\n`;
  console.error(fullMessage);
  fs.appendFileSync(LOG_FILE, fullMessage, 'utf8');

  // ─── Email alert hook ────────────────────────────────────────────────────
  // Uncomment and configure this block to receive email alerts on failures.
  // Requires: npm install nodemailer
  //
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   service: 'gmail',
  //   auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  // });
  // await transporter.sendMail({
  //   from: process.env.GMAIL_USER,
  //   to: process.env.NOTIFICATION_EMAIL,
  //   subject: `[HVAC Lead Gen] ${subject}`,
  //   text: body,
  // });
  // ─────────────────────────────────────────────────────────────────────────
}

module.exports = { log, sendErrorNotification };
