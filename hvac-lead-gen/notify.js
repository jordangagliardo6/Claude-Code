/**
 * Error notification helper.
 *
 * Logs errors to the console with a clear format, and writes them to
 * error.log so you can check them later.
 *
 * To wire up email alerts, set NOTIFICATION_EMAIL and use a mail library
 * (nodemailer + Gmail OAuth or SendGrid) — the hook is already here.
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'error.log');

/**
 * Log an error to the console and error.log file.
 * If NOTIFICATION_EMAIL is set, prints a reminder that email alerts can be wired here.
 */
function notifyError(context, err) {
  const ts = new Date().toISOString();
  const message = `[${ts}] ERROR in ${context}: ${err?.message || err}`;

  console.error('\n' + '='.repeat(60));
  console.error(message);
  if (err?.stack) console.error(err.stack);
  console.error('='.repeat(60) + '\n');

  // Append to error.log for audit trail
  try {
    fs.appendFileSync(LOG_FILE, message + '\n' + (err?.stack ? err.stack + '\n' : ''), 'utf8');
  } catch (_) {
    // Ignore log-write failures — don't recurse
  }

  const email = process.env.NOTIFICATION_EMAIL;
  if (email) {
    // To enable email alerts, install nodemailer and implement sendEmail() below.
    // Example:
    //   await sendEmail(email, `HVAC Lead Gen Error: ${context}`, message);
    console.error(`[notify] Email alert configured for ${email} — wire up nodemailer to activate it.`);
  }
}

/**
 * Log a successful run summary.
 */
function logSuccess(added, total) {
  const ts = new Date().toISOString();
  const message = `[${ts}] Run complete — ${added} new leads added (${total} fetched from Apollo).`;
  console.log(message);
  try {
    fs.appendFileSync(
      path.join(__dirname, 'run.log'),
      message + '\n',
      'utf8'
    );
  } catch (_) {}
}

module.exports = { notifyError, logSuccess };
