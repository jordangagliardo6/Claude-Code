/**
 * Notification module.
 * Logs everything to console. If SMTP credentials are provided in .env,
 * also sends an email alert for errors so you know to check manually.
 */

const nodemailer = require('nodemailer');

/**
 * Send an error notification. Always logs to console.
 * Sends an email if SMTP env vars are configured.
 *
 * @param {string} subject - Short description of the problem
 * @param {string|Error} detail - Full error message or Error object
 */
async function sendErrorNotification(subject, detail) {
  const message = detail instanceof Error
    ? `${detail.message}\n\n${detail.stack || ''}`
    : String(detail);

  const timestamp = new Date().toISOString();
  console.error(`\n[${timestamp}] ERROR: ${subject}`);
  console.error(message);

  if (!smtpConfigured()) return;

  try {
    const transport = createTransport();
    await transport.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.NOTIFICATION_EMAIL,
      subject: `[HVAC Leads] Error: ${subject}`,
      text: `Timestamp: ${timestamp}\n\nError: ${subject}\n\n${message}`,
    });
    console.log(`Email alert sent to ${process.env.NOTIFICATION_EMAIL}`);
  } catch (err) {
    // Email failing shouldn't crash the process — just log it
    console.error('Failed to send email notification:', err.message);
  }
}

/**
 * Log a successful run summary.
 *
 * @param {number} added - Number of leads added this run
 * @param {number} skipped - Number of duplicates skipped
 * @param {number} noPhone - Number of leads dropped for no phone
 */
function logSuccess(added, skipped, noPhone) {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] Run complete:`);
  console.log(`  ✓ ${added} new lead(s) added to sheet`);
  if (skipped > 0) console.log(`  — ${skipped} duplicate(s) skipped`);
  if (noPhone > 0) console.log(`  — ${noPhone} lead(s) dropped (no phone number)`);
}

function smtpConfigured() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.NOTIFICATION_EMAIL
  );
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

module.exports = { sendErrorNotification, logSuccess, smtpConfigured };
