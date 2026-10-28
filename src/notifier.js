'use strict';

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'errors.log');

/**
 * Log an error to the console and to logs/errors.log.
 * Always called, even when email isn't configured.
 */
function logError(context, error) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ERROR in ${context}: ${error.message || error}\n${error.stack || ''}\n`;

  console.error(message);

  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, message + '\n');
  } catch (writeErr) {
    console.error('Could not write to error log:', writeErr.message);
  }
}

/**
 * Send an email alert if Gmail credentials are configured.
 * Falls back to console-only logging if they aren't.
 */
async function notifyError(context, error) {
  logError(context, error);

  const { NOTIFY_EMAIL_TO, NOTIFY_EMAIL_FROM, GMAIL_APP_PASSWORD } = process.env;

  if (!NOTIFY_EMAIL_TO || !GMAIL_APP_PASSWORD) {
    console.log(
      'Email notifications not configured — check logs/errors.log for details.\n' +
      'To enable email alerts, set NOTIFY_EMAIL_TO and GMAIL_APP_PASSWORD in .env'
    );
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: NOTIFY_EMAIL_FROM || NOTIFY_EMAIL_TO,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: NOTIFY_EMAIL_FROM || NOTIFY_EMAIL_TO,
      to: NOTIFY_EMAIL_TO,
      subject: `[HVAC Lead Scraper] Error in ${context}`,
      text: [
        `The HVAC lead scraper hit an error and needs your attention.`,
        ``,
        `Context: ${context}`,
        `Error: ${error.message || error}`,
        ``,
        `Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
        ``,
        `Full details have been written to: logs/errors.log`,
        ``,
        `— HVAC Lead Scraper`,
      ].join('\n'),
    });

    console.log(`Alert email sent to ${NOTIFY_EMAIL_TO}`);
  } catch (emailErr) {
    console.error('Could not send alert email:', emailErr.message);
  }
}

/**
 * Log a successful run summary to logs/run.log.
 */
function logSuccess(added, skipped, total) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] RUN OK — fetched ${total} from Apollo | added ${added} | skipped ${skipped} duplicates\n`;

  console.log(message.trim());

  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, 'run.log'), message);
  } catch (_) {
    // Non-fatal — don't crash on log write failure
  }
}

module.exports = { notifyError, logSuccess, logError };
