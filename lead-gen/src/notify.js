/**
 * Error notification helper.
 * Always logs to console. Sends an email alert if SMTP env vars are set.
 */

const nodemailer = require('nodemailer');

/**
 * Log an error and optionally send an email alert.
 *
 * @param {string}          message  Human-readable description of the failure
 * @param {Error|null}      error    The underlying error object (optional)
 */
async function sendErrorAlert(message, error) {
  // Always write to console so server logs capture it
  console.error(`\n[ERROR] ${message}`);
  if (error?.stack) {
    console.error(error.stack);
  } else if (error) {
    console.error(String(error));
  }

  const { NOTIFICATION_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  // Email is optional — skip silently if not configured
  if (!SMTP_USER || !SMTP_PASS || !NOTIFICATION_EMAIL) {
    console.log('[Notify] SMTP not configured — console log only.\n');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(SMTP_PORT || '587', 10),
      secure: false, // TLS via STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const body = [
      message,
      '',
      error ? (error.stack || error.message || String(error)) : '',
      '',
      `Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
    ].join('\n');

    await transporter.sendMail({
      from: `"HVAC Lead Gen" <${SMTP_USER}>`,
      to: NOTIFICATION_EMAIL,
      subject: '[HVAC Lead Gen] Run Error — Manual Check Required',
      text: body,
    });

    console.log(`[Notify] Alert email sent to ${NOTIFICATION_EMAIL}.\n`);
  } catch (emailErr) {
    // Don't let a notification failure mask the original error
    console.error(`[Notify] Email send failed: ${emailErr.message}\n`);
  }
}

module.exports = { sendErrorAlert };
