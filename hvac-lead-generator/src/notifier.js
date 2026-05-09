const nodemailer = require('nodemailer');

/**
 * Send an error notification email.
 * Falls back to console-only if SMTP credentials are not configured.
 *
 * @param {string} subject   - Short subject line (appended after "[HVAC Lead Generator]")
 * @param {string} body      - Plain-text body
 * @param {any}    [details] - Optional extra data (logged as JSON)
 */
async function sendErrorNotification(subject, body, details = null) {
  const to       = process.env.NOTIFICATION_EMAIL;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  // Always print to console regardless of email config
  console.error(`\n[NOTIFICATION] ${subject}`);
  console.error(body);
  if (details) console.error(JSON.stringify(details, null, 2));

  if (!to || !smtpUser || !smtpPass) {
    // Email not configured — console log is the fallback
    console.warn(
      '[NOTIFICATION] Email alerts are disabled. ' +
      'Set NOTIFICATION_EMAIL, SMTP_USER, and SMTP_PASS in your .env to enable them.'
    );
    return;
  }

  try {
    const transport = nodemailer.createTransport({
      host:   process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: false,
      auth:   { user: smtpUser, pass: smtpPass },
    });

    const detailsBlock = details
      ? `\n\nDetails:\n${JSON.stringify(details, null, 2)}`
      : '';

    await transport.sendMail({
      from:    smtpUser,
      to,
      subject: `[HVAC Lead Generator] ${subject}`,
      text:    `${body}${detailsBlock}\n\nTimestamp: ${new Date().toISOString()}`,
    });

    console.log(`[NOTIFICATION] Alert emailed to ${to}`);
  } catch (emailError) {
    console.error(`[NOTIFICATION] Failed to send email alert: ${emailError.message}`);
  }
}

module.exports = { sendErrorNotification };
