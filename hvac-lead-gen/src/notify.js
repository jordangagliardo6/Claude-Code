/**
 * Notification helper
 *
 * Always logs to console. If SMTP credentials are configured in .env,
 * also sends an email alert so you know to check things manually.
 */

const nodemailer = require('nodemailer');

/**
 * Log a success summary and optionally email it.
 *
 * @param {{ added: number, skipped: number, totalSearched: number }} stats
 */
async function notifySuccess(stats) {
  const msg =
    `[HVAC Lead Gen] Run complete — ` +
    `${stats.added} leads added, ${stats.skipped} duplicates skipped ` +
    `(searched ${stats.totalSearched} contacts from Apollo)`;

  console.log(`\n✓ ${msg}`);
  // Success notifications are console-only unless you want to change this
}

/**
 * Log an error and send an email alert if SMTP is configured.
 *
 * @param {Error|string} err
 * @param {string} context - Where in the workflow the error occurred
 */
async function notifyError(err, context = 'workflow') {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? `\n\n${err.stack}` : '';

  console.error(`\n✗ [HVAC Lead Gen] ERROR in ${context}: ${message}`);

  const to = process.env.ALERT_EMAIL_TO;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!to || !smtpUser || !smtpPass) {
    // Email not configured — console log is the only output
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpUser,
      to,
      subject: `[HVAC Lead Gen] Error — needs manual check`,
      text:
        `The HVAC lead generation workflow encountered an error.\n\n` +
        `Context: ${context}\n` +
        `Error: ${message}${stack}\n\n` +
        `Time: ${new Date().toISOString()}\n\n` +
        `Check the server logs for more detail.`,
    });

    console.log(`  Alert email sent to ${to}`);
  } catch (mailErr) {
    console.error(`  Could not send alert email: ${mailErr.message}`);
  }
}

module.exports = { notifySuccess, notifyError };
