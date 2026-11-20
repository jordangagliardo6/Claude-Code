const nodemailer = require('nodemailer');
const config = require('./config');

/**
 * Logs an error to the console with a timestamp.
 * Also sends an email alert if SMTP credentials are configured.
 */
async function notifyError(context, error) {
  const timestamp = new Date().toISOString();
  const subject = `[HVAC Scraper] Error — ${context}`;
  const body = `
HVAC Lead Scraper encountered an error.

Time:    ${timestamp}
Context: ${context}
Error:   ${error.message || error}

${error.stack ? `Stack trace:\n${error.stack}` : ''}

---
Check your terminal or logs for more detail.
Run "node src/run-once.js" to retry manually.
  `.trim();

  // Always log to console
  console.error(`\n[ERROR] ${timestamp} — ${context}`);
  console.error(error.message || error);

  // Send email only if credentials are configured
  if (!config.notify.from || !config.notify.password || !config.notify.to) {
    console.warn('[Notify] Email credentials not configured — skipping email alert.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.notify.from,
        pass: config.notify.password, // Gmail App Password (not regular password)
      },
    });

    await transporter.sendMail({
      from: config.notify.from,
      to: config.notify.to,
      subject,
      text: body,
    });

    console.log(`[Notify] Error alert sent to ${config.notify.to}`);
  } catch (mailErr) {
    console.error('[Notify] Failed to send email alert:', mailErr.message);
  }
}

/**
 * Sends a summary email after a successful run.
 * Optional — only fires if email is configured.
 */
async function notifySuccess(added, skipped, total) {
  if (!config.notify.from || !config.notify.password || !config.notify.to) return;

  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: config.notify.from, pass: config.notify.password },
    });

    await transporter.sendMail({
      from: config.notify.from,
      to: config.notify.to,
      subject: `[HVAC Scraper] Run complete — ${added} new leads added`,
      text: `
HVAC Lead Scraper daily run complete.

Time:          ${timestamp} (Eastern)
New leads added: ${added}
Duplicates skipped: ${skipped}
Total from Apollo:  ${total}

Open your Google Sheet to see the new leads.
      `.trim(),
    });
  } catch (err) {
    // Don't throw on success notification failure — it's non-critical
    console.warn('[Notify] Could not send success email:', err.message);
  }
}

module.exports = { notifyError, notifySuccess };
