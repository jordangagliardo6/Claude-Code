/**
 * notify.js — Error notification module.
 *
 * On failure, logs a structured error to the console and optionally sends
 * an email alert via SMTP (configured in .env).
 *
 * Email notifications require:
 *   NOTIFY_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *
 * Gmail users: create an App Password at https://myaccount.google.com/apppasswords
 * and use that as SMTP_PASS (not your regular Gmail password).
 */

const nodemailer = require('nodemailer');

/**
 * Log the error to the console with a timestamp.
 *
 * @param {string} context - Short label (e.g. "Apollo search", "Sheets append")
 * @param {Error|string} err
 */
function logError(context, err) {
  const ts      = new Date().toISOString();
  const message = err instanceof Error ? err.message : String(err);
  const stack   = err instanceof Error ? err.stack   : '';

  console.error(`\n╔══ ERROR [${ts}] ══════════════════════════════════╗`);
  console.error(`  Context : ${context}`);
  console.error(`  Message : ${message}`);
  if (stack) console.error(`  Stack   :\n${stack}`);
  console.error(`╚════════════════════════════════════════════════════╝\n`);
}

/**
 * Send an email alert if SMTP credentials are configured.
 * Silently skips (with a console note) if the env vars are missing.
 *
 * @param {string} context - Short label describing where the error occurred
 * @param {Error|string} err
 */
async function sendEmailAlert(context, err) {
  const { NOTIFY_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!NOTIFY_EMAIL || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[Notify] SMTP credentials not set — skipping email alert.');
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  const stack   = err instanceof Error ? (err.stack || '') : '';
  const ts      = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  const transporter = nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   parseInt(SMTP_PORT || '587', 10),
    secure: parseInt(SMTP_PORT || '587', 10) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from:    `"HVAC Lead Gen Bot" <${SMTP_USER}>`,
      to:      NOTIFY_EMAIL,
      subject: `⚠️ Lead Gen Error — ${context}`,
      text: [
        `An error occurred during the HVAC lead generation run.`,
        ``,
        `Time    : ${ts} Eastern`,
        `Context : ${context}`,
        `Error   : ${message}`,
        ``,
        stack ? `Stack trace:\n${stack}` : '',
        ``,
        `Check the server console log for full details.`,
      ].join('\n'),
    });

    console.log(`[Notify] Alert email sent to ${NOTIFY_EMAIL}`);
  } catch (mailErr) {
    // Don't let a notification failure mask the original error
    console.error(`[Notify] Failed to send email alert: ${mailErr.message}`);
  }
}

/**
 * Convenience: log + email in one call.
 *
 * @param {string} context
 * @param {Error|string} err
 */
async function alertError(context, err) {
  logError(context, err);
  await sendEmailAlert(context, err);
}

module.exports = { alertError, logError, sendEmailAlert };
