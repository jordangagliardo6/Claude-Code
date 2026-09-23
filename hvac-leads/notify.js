/**
 * Error notification helper.
 * Logs to console always; also sends an email alert when SMTP is configured.
 */

const nodemailer = require('nodemailer');

/**
 * Send an error alert via email (and always print to console).
 * @param {string} summary - One-line description of the failure.
 * @param {Error}  err     - The original error object (optional, for stack trace in logs).
 */
async function sendErrorNotification(summary, err) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ERROR] ${summary}`);
  if (err?.stack) console.error(err.stack);

  const recipient = process.env.NOTIFICATION_EMAIL;
  if (!recipient) {
    console.warn('[Notify] NOTIFICATION_EMAIL not set — skipping email alert.');
    return;
  }

  const smtpConfigured =
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

  if (!smtpConfigured) {
    console.warn('[Notify] SMTP not configured (SMTP_HOST / SMTP_USER / SMTP_PASS) — skipping email.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const body = [
    `The HVAC lead generator encountered an error and did not complete.`,
    ``,
    `Timestamp: ${timestamp}`,
    `Error: ${summary}`,
    err?.stack ? `\nStack trace:\n${err.stack}` : '',
    ``,
    `Check the process logs for more detail, then re-run manually:`,
    `  node index.js --run-now`,
  ].join('\n');

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: recipient,
      subject: `[HVAC Leads] Run failed — ${new Date().toLocaleDateString('en-US')}`,
      text: body,
    });
    console.log(`[Notify] Alert email sent to ${recipient}`);
  } catch (mailErr) {
    console.error(`[Notify] Failed to send alert email: ${mailErr.message}`);
  }
}

/**
 * Log a successful run summary to console (no email needed for success).
 */
function logSuccess(leadsAdded, totalExisting) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] Run complete. Added: ${leadsAdded} new leads | Sheet total: ${totalExisting + leadsAdded}`);
}

module.exports = { sendErrorNotification, logSuccess };
