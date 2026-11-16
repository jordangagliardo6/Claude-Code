/**
 * Error notification helpers
 *
 * On failure, logs to console and optionally sends an email alert via Gmail SMTP.
 * Configure NOTIFY_EMAIL, GMAIL_USER, GMAIL_APP_PASSWORD in .env to enable email.
 *
 * Gmail app passwords: https://myaccount.google.com/apppasswords
 */

const nodemailer = require('nodemailer');

/**
 * Log an error and optionally email it.
 *
 * @param {string} subject - Short description (used as email subject)
 * @param {string|Error} detail - Full error or message body
 */
async function notifyError(subject, detail) {
  const body = detail instanceof Error
    ? `${detail.message}\n\n${detail.stack}`
    : String(detail);

  const timestamp = new Date().toISOString();
  console.error(`\n[${timestamp}] ERROR — ${subject}`);
  console.error(body);

  const to = process.env.NOTIFY_EMAIL;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!to || !user || !pass) {
    // Email not configured — console log is the only notification
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: user,
      to,
      subject: `[HVAC Leads] ${subject}`,
      text: `Automated run at ${timestamp}\n\n${body}`,
    });

    console.log(`Error notification sent to ${to}`);
  } catch (emailErr) {
    console.error('Failed to send email notification:', emailErr.message);
  }
}

/**
 * Log a successful run summary.
 */
function logSuccess({ added, skipped, totalFetched }) {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] Run complete`);
  console.log(`  Fetched from Apollo : ${totalFetched}`);
  console.log(`  New rows added      : ${added}`);
  console.log(`  Duplicates skipped  : ${skipped}`);
}

module.exports = { notifyError, logSuccess };
