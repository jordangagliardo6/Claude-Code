/**
 * Error notification module.
 * Logs errors to console and optionally sends an email alert via Gmail.
 *
 * To enable email alerts, set NOTIFY_EMAIL, GMAIL_USER, and GMAIL_APP_PASSWORD
 * in your .env file. If those vars are missing, errors are console-only.
 */

const nodemailer = require('nodemailer');

/**
 * Send an error notification — console always, email if configured.
 *
 * @param {string} subject - Short description of the error
 * @param {string|Error} errorDetail - Full error message or Error object
 */
async function notifyError(subject, errorDetail) {
  const message = errorDetail instanceof Error
    ? `${errorDetail.message}\n\nStack:\n${errorDetail.stack}`
    : String(errorDetail);

  // Always log to console for server/cron logs
  console.error('\n========================================');
  console.error(`ERROR: ${subject}`);
  console.error('----------------------------------------');
  console.error(message);
  console.error('========================================\n');

  // Send email if credentials are configured
  const { NOTIFY_EMAIL, GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!NOTIFY_EMAIL || !GMAIL_USER || !GMAIL_APP_PASSWORD) return;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${GMAIL_USER}>`,
      to: NOTIFY_EMAIL,
      subject: `[HVAC Lead Gen] Error: ${subject}`,
      text: [
        `An error occurred in the HVAC Lead Generation workflow.`,
        ``,
        `Error: ${subject}`,
        ``,
        `Details:`,
        message,
        ``,
        `Timestamp: ${new Date().toISOString()}`,
      ].join('\n'),
    });

    console.log(`  Email alert sent to ${NOTIFY_EMAIL}`);
  } catch (emailErr) {
    console.error(`  Could not send email alert: ${emailErr.message}`);
  }
}

/**
 * Log a successful run summary.
 *
 * @param {object} summary - { appended, skipped, totalFromApollo }
 */
function logSuccess(summary) {
  console.log('\n========================================');
  console.log('HVAC Lead Gen — Run Complete');
  console.log('----------------------------------------');
  console.log(`  New leads added : ${summary.appended}`);
  console.log(`  Duplicates skipped: ${summary.skipped}`);
  console.log(`  Apollo returned  : ${summary.totalFromApollo}`);
  console.log(`  Timestamp        : ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log('========================================\n');
}

module.exports = { notifyError, logSuccess };
