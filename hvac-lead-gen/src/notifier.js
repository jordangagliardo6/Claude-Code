/**
 * notifier.js
 * Structured logging and error notification system.
 *
 * Logs always go to the console with timestamps.
 * If ALERT_EMAIL and SMTP_* env vars are configured, errors are also
 * emailed via Nodemailer so you know immediately if a run fails.
 *
 * Required env vars for email (all optional — console-only if absent):
 *   ALERT_EMAIL      – address to receive error alerts
 *   SMTP_HOST        – e.g. smtp.gmail.com
 *   SMTP_PORT        – e.g. 587
 *   SMTP_USER        – your SMTP username / Gmail address
 *   SMTP_PASS        – your SMTP password or app password
 *
 * Gmail tip: use an App Password (not your main password).
 * Generate one at https://myaccount.google.com/apppasswords
 */

const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// Log formatting
// ---------------------------------------------------------------------------

/**
 * timestamp — returns an ISO-8601 string in Eastern Time.
 */
function timestamp() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function log(level, ...args) {
  console.log(`[${timestamp()}] [${level.padEnd(5)}]`, ...args);
}

const logger = {
  info:  (...args) => log('INFO',  ...args),
  warn:  (...args) => log('WARN',  ...args),
  error: (...args) => log('ERROR', ...args),
  debug: (...args) => {
    if (process.env.DEBUG) log('DEBUG', ...args);
  },
};

// ---------------------------------------------------------------------------
// Email transport (lazy-initialised)
// ---------------------------------------------------------------------------

let _transporter = null;

/**
 * getTransporter — builds a Nodemailer transport from env vars.
 * Returns null if SMTP vars are not configured (silent degradation).
 */
function getTransporter() {
  if (_transporter) return _transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null; // email not configured — console-only mode
  }

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465, // true for 465, false for 587/25
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return _transporter;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * notifyError
 * Logs an error to the console AND sends an email alert if SMTP is configured.
 *
 * @param {string}      subject  – short description of what failed
 * @param {Error|string} err     – the error object or message
 * @param {Object}      [ctx]    – optional extra context (included in email body)
 */
async function notifyError(subject, err, ctx = {}) {
  const message = err instanceof Error ? err.message : String(err);
  const stack    = err instanceof Error ? (err.stack ?? '') : '';

  logger.error(`${subject}: ${message}`);
  if (stack) logger.error(stack);

  const alertEmail = process.env.ALERT_EMAIL;
  const transporter = getTransporter();

  if (!alertEmail) {
    logger.warn(
      'ALERT_EMAIL not set — error logged to console only. ' +
      'Set ALERT_EMAIL + SMTP_* vars to receive email alerts.'
    );
    return;
  }

  if (!transporter) {
    logger.warn(
      'SMTP not configured — error logged to console only. ' +
      'Set SMTP_HOST, SMTP_USER, SMTP_PASS to enable email alerts.'
    );
    return;
  }

  const contextLines = Object.entries(ctx)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
    .join('\n');

  const body = [
    `HVAC Lead Gen — Error Alert`,
    `Time    : ${timestamp()}`,
    `Subject : ${subject}`,
    `Message : ${message}`,
    contextLines ? `\nContext:\n${contextLines}` : '',
    stack ? `\nStack Trace:\n${stack}` : '',
    '\n— Automated alert from hvac-lead-gen',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${process.env.SMTP_USER}>`,
      to: alertEmail,
      subject: `[HVAC Lead Gen] Error: ${subject}`,
      text: body,
    });
    logger.info(`Error alert sent to ${alertEmail}`);
  } catch (mailErr) {
    logger.error(`Failed to send error email: ${mailErr.message}`);
  }
}

/**
 * notifySuccess
 * Logs a run-complete summary. No email for successes (keeps inbox clean).
 *
 * @param {{ inserted: number, skipped: number }} stats
 */
function notifySuccess(stats) {
  logger.info(
    `Run complete — Inserted: ${stats.inserted} lead(s), ` +
    `Skipped: ${stats.skipped} duplicate(s).`
  );
}

module.exports = { logger, notifyError, notifySuccess };
