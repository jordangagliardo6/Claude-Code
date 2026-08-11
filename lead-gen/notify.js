// ─── Error Notification Module ───────────────────────────────────────────────
// Logs errors to console. Uncomment the nodemailer block below to also send
// email alerts when a run fails.
// ────────────────────────────────────────────────────────────────────────────

// To enable email alerts:
//   npm install nodemailer
//   Add to .env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
//
// const nodemailer = require('nodemailer');
//
// async function sendEmail(subject, body) {
//   const transporter = nodemailer.createTransport({
//     host: process.env.SMTP_HOST,
//     port: Number(process.env.SMTP_PORT) || 587,
//     secure: false,
//     auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
//   });
//   await transporter.sendMail({
//     from: process.env.SMTP_USER,
//     to: process.env.ALERT_EMAIL,
//     subject,
//     text: body,
//   });
// }

async function sendAlert(subject, error, config) {
  const message = [
    `[HVAC Lead Gen Alert] ${subject}`,
    `Time: ${new Date().toISOString()}`,
    `Error: ${error.message}`,
    '',
    'Check the process logs for the full stack trace.',
    `Target sheet: https://docs.google.com/spreadsheets/d/${config.sheets.spreadsheetId}`,
  ].join('\n');

  // Always log — this is always visible in the terminal / process manager logs
  console.error('\n' + '─'.repeat(60));
  console.error(message);
  console.error('─'.repeat(60) + '\n');

  // Uncomment to also send email:
  // try {
  //   await sendEmail(`[Lead Gen Error] ${subject}`, message);
  //   console.log('Alert email sent to', config.alertEmail);
  // } catch (mailErr) {
  //   console.error('Failed to send alert email:', mailErr.message);
  // }
}

module.exports = { sendAlert };
