/**
 * notifier.js
 *
 * Handles success and error notifications.
 *
 * Always logs to the console.
 * Sends an email alert when SMTP_USER / SMTP_PASS / NOTIFICATION_EMAIL are set.
 */

const nodemailer = require('nodemailer');

/**
 * Log a successful run summary.
 */
function logSuccess({ addedCount, skippedCount, totalFetched }) {
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n✅  [${now}] Workflow completed successfully`);
  console.log(`   Apollo records fetched : ${totalFetched}`);
  console.log(`   New leads added        : ${addedCount}`);
  console.log(`   Duplicates skipped     : ${skippedCount}\n`);
}

/**
 * Log an error and optionally send an email alert.
 *
 * @param {Error|string} err   - the error
 * @param {string}       stage - e.g. 'Apollo search' or 'Google Sheets write'
 */
async function notifyError(err, stage = 'workflow') {
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const message = err?.message || String(err);

  console.error(`\n❌  [${now}] ERROR in ${stage}`);
  console.error(`   ${message}\n`);

  if (canSendEmail()) {
    try {
      await sendEmailAlert(stage, message, now);
      console.log('   📧  Error notification email sent.\n');
    } catch (mailErr) {
      console.error(`   (Could not send email alert: ${mailErr.message})`);
    }
  } else {
    console.log(
      '   (Email alerts are not configured — set SMTP_USER, SMTP_PASS, and NOTIFICATION_EMAIL in .env to enable them.)\n'
    );
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

function canSendEmail() {
  return !!(
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.NOTIFICATION_EMAIL
  );
}

async function sendEmailAlert(stage, message, timestamp) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `HVAC Lead Workflow <${process.env.SMTP_USER}>`,
    to: process.env.NOTIFICATION_EMAIL,
    subject: `⚠️ HVAC Lead Workflow Error — ${stage}`,
    text: [
      `The HVAC lead generation workflow encountered an error.`,
      ``,
      `Time   : ${timestamp}`,
      `Stage  : ${stage}`,
      `Error  : ${message}`,
      ``,
      `Check the server logs for more detail.`,
      `You may need to run the workflow manually today.`,
    ].join('\n'),
  });
}

module.exports = { logSuccess, notifyError };
