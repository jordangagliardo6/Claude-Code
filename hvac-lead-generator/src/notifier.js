const nodemailer = require('nodemailer');
const config = require('./config');

// Sends an error alert email when a run fails.
// If SMTP credentials are not configured, the error is logged to console only.
async function sendErrorNotification(subject, body) {
  const to = process.env.NOTIFICATION_EMAIL || config.notificationEmail;
  const fullMessage = `${subject}\n\n${body}`;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('[ALERT] Error notification (SMTP not configured — logging only):');
    console.error(fullMessage);
    console.error(`\nTo receive email alerts, set SMTP_HOST, SMTP_USER, and SMTP_PASS in your .env`);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"HVAC Lead Generator" <${process.env.SMTP_USER}>`,
      to,
      subject: `[HVAC Lead Generator] ${subject}`,
      text: fullMessage,
    });

    console.log(`Alert email sent to ${to}`);
  } catch (err) {
    console.error(`Failed to send alert email: ${err.message}`);
  }
}

module.exports = { sendErrorNotification };
