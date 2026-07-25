'use strict';

/**
 * Error notification helper.
 *
 * Logs all errors to the console. If SMTP credentials are set in .env,
 * also sends an email to NOTIFY_EMAIL so you can catch failures while away.
 *
 * The email dependency (nodemailer) is intentionally NOT in package.json
 * because it's optional — only install it if you want email alerts:
 *   npm install nodemailer
 */

async function notifyError(subject, body) {
  const msg = `[apollo-lead-gen] ${subject}\n\n${body}`;
  console.error('\n⚠️  ERROR NOTIFICATION');
  console.error('─'.repeat(60));
  console.error(msg);
  console.error('─'.repeat(60));

  await _trySendEmail(subject, body).catch(() => {
    // Email is best-effort — never let a notification failure crash the runner
  });
}

async function _trySendEmail(subject, body) {
  const to   = process.env.NOTIFY_EMAIL;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!to || !host || !user || !pass) return; // SMTP not configured

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    // nodemailer not installed — skip email silently
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth:   { user, pass },
  });

  await transporter.sendMail({
    from:    user,
    to,
    subject: `[apollo-lead-gen] ${subject}`,
    text:    body,
  });

  console.log(`  [Notify] Error email sent to ${to}`);
}

module.exports = { notifyError };
