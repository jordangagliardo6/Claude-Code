// Error reporting: always logs to the console, and additionally emails you if
// ALERT_EMAIL/EMAIL_USER/EMAIL_PASS are configured in .env.
const nodemailer = require('nodemailer');

async function notifyError(subject, error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`[${new Date().toISOString()}] ERROR: ${subject}\n${message}`);

  const { ALERT_EMAIL, EMAIL_USER, EMAIL_PASS } = process.env;
  if (!ALERT_EMAIL || !EMAIL_USER || !EMAIL_PASS) {
    console.warn(
      'Email alerting is not configured (set ALERT_EMAIL, EMAIL_USER, EMAIL_PASS in .env) - skipping email notification.'
    );
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    });
    await transporter.sendMail({
      from: EMAIL_USER,
      to: ALERT_EMAIL,
      subject: `HVAC Lead Gen Workflow: ${subject}`,
      text: message,
    });
    console.log(`Alert email sent to ${ALERT_EMAIL}.`);
  } catch (mailErr) {
    console.error('Failed to send alert email:', mailErr.message);
  }
}

module.exports = { notifyError };
