'use strict';

/**
 * Error notification helper.
 *
 * Always logs to the console.
 * If NOTIFY_EMAIL=true and ALERT_EMAIL + GMAIL_APP_PASSWORD are set,
 * also sends an email alert via Gmail SMTP.
 */

const nodemailer = require('nodemailer');

/**
 * Log a message and optionally send an email alert.
 *
 * @param {string} subject  Short subject line.
 * @param {string} body     Full error detail.
 */
async function notifyError(subject, body) {
  const timestamp = new Date().toISOString();
  console.error(`\n[ERROR ${timestamp}] ${subject}`);
  console.error(body);
  console.error('─'.repeat(60));

  if (process.env.NOTIFY_EMAIL !== 'true') return;

  const alertEmail = process.env.ALERT_EMAIL;
  const appPassword = process.env.GMAIL_APP_PASSWORD;

  if (!alertEmail || !appPassword) {
    console.warn('[Notify] NOTIFY_EMAIL=true but ALERT_EMAIL or GMAIL_APP_PASSWORD is missing — skipping email.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: alertEmail, pass: appPassword },
    });

    await transporter.sendMail({
      from: alertEmail,
      to: alertEmail,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: `Timestamp: ${timestamp}\n\n${body}\n\nCheck the logs for details.`,
    });

    console.log(`[Notify] Alert email sent to ${alertEmail}.`);
  } catch (err) {
    console.error(`[Notify] Failed to send alert email: ${err.message}`);
  }
}

/**
 * Log a successful run summary.
 */
function logSuccess(leadsAdded, totalExisting) {
  const timestamp = new Date().toISOString();
  console.log(`\n[OK ${timestamp}] Run complete — ${leadsAdded} new lead(s) added. Sheet total: ${totalExisting + leadsAdded}.`);
}

module.exports = { notifyError, logSuccess };
