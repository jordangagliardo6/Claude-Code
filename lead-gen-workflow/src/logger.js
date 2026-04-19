const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const logFile = path.join(LOG_DIR, `run-${new Date().toISOString().slice(0, 10)}.log`);

function timestamp() {
  return new Date().toISOString();
}

function write(level, message) {
  const line = `[${timestamp()}] [${level}] ${message}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

const log = {
  info:  (msg) => write('INFO', msg),
  warn:  (msg) => write('WARN', msg),
  error: (msg) => write('ERROR', msg),
  debug: (msg) => { if (process.env.DEBUG === 'true') write('DEBUG', msg); },
};

// Send an email alert when something goes wrong
async function sendAlert(subject, body) {
  const { ALERT_EMAIL_TO, ALERT_EMAIL_FROM, ALERT_EMAIL_PASSWORD } = process.env;

  if (!ALERT_EMAIL_TO || !ALERT_EMAIL_FROM || !ALERT_EMAIL_PASSWORD) {
    log.warn('Email alert skipped — ALERT_EMAIL_* env vars not configured.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: ALERT_EMAIL_FROM, pass: ALERT_EMAIL_PASSWORD },
    });

    await transporter.sendMail({
      from: ALERT_EMAIL_FROM,
      to: ALERT_EMAIL_TO,
      subject: `[Lead Gen] ${subject}`,
      text: body,
    });

    log.info(`Alert email sent to ${ALERT_EMAIL_TO}`);
  } catch (err) {
    log.error(`Failed to send alert email: ${err.message}`);
  }
}

module.exports = { log, sendAlert };
