const nodemailer = require('nodemailer');
const { config } = require('./config');

// Sends an error notification email if Gmail credentials are configured.
// Always logs to console regardless.
async function notifyError(subject, errorMessage) {
  const timestamp = new Date().toISOString();
  const body = `[HVAC Lead Gen Error]\nTime: ${timestamp}\n\n${errorMessage}\n\nCheck the logs on your server for more detail.`;

  console.error(`[Notify] ERROR — ${subject}`);
  console.error(`[Notify] ${errorMessage}`);

  if (!config.notification.gmailUser || !config.notification.gmailPassword) {
    console.log('[Notify] No Gmail credentials configured — skipping email alert.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.notification.gmailUser,
        pass: config.notification.gmailPassword,
      },
    });

    await transporter.sendMail({
      from: config.notification.gmailUser,
      to: config.notification.email,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: body,
    });

    console.log(`[Notify] Error email sent to ${config.notification.email}`);
  } catch (mailErr) {
    console.error(`[Notify] Failed to send email alert: ${mailErr.message}`);
  }
}

// Logs a successful run summary (no email needed on success).
function logSuccess(added, skipped) {
  const timestamp = new Date().toISOString();
  console.log(`[Notify] Run complete at ${timestamp} — Added: ${added}, Skipped (duplicates): ${skipped}`);
}

module.exports = { notifyError, logSuccess };
