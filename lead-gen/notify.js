'use strict';

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const LOG_FILE = path.join(__dirname, 'error.log');

/**
 * Append an error entry to error.log and optionally send an email alert.
 *
 * Email is sent only when NOTIFY_EMAIL, SMTP_HOST, SMTP_USER, and SMTP_PASS
 * are all set as environment variables. If any are missing the error is still
 * logged to disk but no email is attempted.
 */
async function notifyError(message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ERROR: ${message}\n`;

  // Always log to disk
  try {
    fs.appendFileSync(LOG_FILE, entry);
  } catch (_) {
    // If the log file itself is unwritable, just continue
  }

  console.error('\n' + '='.repeat(60));
  console.error('ERROR — check error.log for details');
  console.error(message);
  console.error('='.repeat(60) + '\n');

  // Send email if SMTP credentials are configured
  const { NOTIFY_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!NOTIFY_EMAIL || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) return;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"Lead Gen Bot" <${SMTP_USER}>`,
      to: NOTIFY_EMAIL,
      subject: '[Lead Gen] Error — manual check needed',
      text: `An error occurred during the scheduled HVAC lead gen run.\n\n${message}\n\nCheck error.log for full details.`,
    });

    console.log(`  Alert email sent to ${NOTIFY_EMAIL}`);
  } catch (emailErr) {
    console.error(`  (Could not send alert email: ${emailErr.message})`);
  }
}

module.exports = { notifyError };
