/**
 * logger.js — Simple structured logger with error notification support.
 *
 * All messages are timestamped and tagged with a level prefix.
 * When an error occurs, a notification is emitted to the console with
 * instructions for how to set up email alerts (nodemailer) if desired.
 */

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || '';

function timestamp() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
}

function info(msg) {
  console.log(`[${timestamp()}] [INFO]  ${msg}`);
}

function warn(msg) {
  console.warn(`[${timestamp()}] [WARN]  ${msg}`);
}

/**
 * Log an error and emit a notification (console + optional email).
 * @param {string} context  Short label for where the error happened
 * @param {Error|string} err
 */
function error(context, err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${timestamp()}] [ERROR] [${context}] ${message}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  notifyError(context, message);
}

/**
 * Sends an error notification.
 *
 * Right now this logs a prominent banner to the console so it's impossible
 * to miss in any log aggregator or terminal output.
 *
 * To enable email alerts:
 *   1. npm install nodemailer
 *   2. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFY_EMAIL in .env
 *   3. Uncomment and fill in the nodemailer block below.
 */
function notifyError(context, message) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════╗');
  console.error('║  ⚠  LEAD-GEN WORKFLOW ERROR — MANUAL CHECK REQUIRED  ║');
  console.error('╠══════════════════════════════════════════════════════╣');
  console.error(`║  Context : ${context.padEnd(41)} ║`);
  console.error(`║  Time    : ${timestamp().slice(0, 41).padEnd(41)} ║`);
  console.error(`║  Message : ${message.slice(0, 41).padEnd(41)} ║`);
  if (message.length > 41) {
    console.error(`║            ${message.slice(41, 82).padEnd(41)} ║`);
  }
  if (NOTIFY_EMAIL) {
    console.error(`║  Notify  : ${NOTIFY_EMAIL.padEnd(41)} ║`);
  }
  console.error('╚══════════════════════════════════════════════════════╝');
  console.error('');

  /* ── Optional email alert (requires nodemailer + SMTP env vars) ──────────────
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  transporter.sendMail({
    from: process.env.SMTP_USER,
    to: NOTIFY_EMAIL,
    subject: `[Lead-Gen Error] ${context}`,
    text: `Error in Apollo Lead Gen workflow:\n\nContext: ${context}\nTime: ${timestamp()}\nMessage: ${message}`,
  }).catch(console.error);
  ── ─────────────────────────────────────────────────────────────────────── */
}

module.exports = { info, warn, error };
