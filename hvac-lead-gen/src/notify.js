/**
 * Notification helper
 * Logs errors to console and optionally sends an email alert via SMTP.
 * Email is only attempted when NOTIFY_EMAIL + SMTP_* vars are all set.
 */

const nodemailer = require('nodemailer');

function log(level, message, detail = '') {
  const ts = new Date().toISOString();
  const line = detail ? `${message}\n  ${detail}` : message;
  console[level === 'error' ? 'error' : 'log'](`[${ts}] [${level.toUpperCase()}] ${line}`);
}

async function sendErrorEmail(subject, body) {
  const { NOTIFY_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!NOTIFY_EMAIL || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    // Email not configured — console-only fallback
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_USER,
      to: NOTIFY_EMAIL,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: body,
    });

    console.log(`[Notify] Error email sent to ${NOTIFY_EMAIL}`);
  } catch (emailErr) {
    console.error('[Notify] Failed to send error email:', emailErr.message);
  }
}

/**
 * Call this whenever the workflow hits a hard error.
 * Logs to console and fires an email if configured.
 */
async function notifyError(context, error) {
  const message = `Workflow error in ${context}`;
  const detail = error instanceof Error ? error.stack || error.message : String(error);

  log('error', message, detail);

  await sendErrorEmail(
    `Error: ${context}`,
    `The HVAC lead generation workflow encountered an error.\n\nContext: ${context}\n\nError:\n${detail}\n\nTimestamp: ${new Date().toISOString()}`
  );
}

module.exports = { log, notifyError };
