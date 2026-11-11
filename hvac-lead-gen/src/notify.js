const nodemailer = require('nodemailer');
const config = require('./config');

/**
 * Send an error notification email and always log to console.
 * Email is skipped if NOTIFICATION_EMAIL or SMTP credentials are not set.
 */
async function sendErrorNotification(subject, body) {
  console.error(`[Notify] ERROR: ${subject}`);
  console.error(`[Notify] ${body}`);

  const { email, smtp } = config.notifications;

  // Skip email if not configured
  if (!email || !smtp.user || !smtp.pass) {
    console.log('[Notify] Email notifications not configured — error logged to console only.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });

    await transporter.sendMail({
      from: smtp.user,
      to: email,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: `${body}\n\nTimestamp: ${new Date().toISOString()}`,
    });

    console.log(`[Notify] Error email sent to ${email}`);
  } catch (mailErr) {
    console.error(`[Notify] Failed to send email notification: ${mailErr.message}`);
  }
}

/**
 * Log a successful run summary to console.
 */
function logSuccess(newLeadCount, skippedCount) {
  console.log(
    `[Summary] Run complete. Added: ${newLeadCount} new leads, Skipped: ${skippedCount} duplicates.`
  );
}

module.exports = { sendErrorNotification, logSuccess };
