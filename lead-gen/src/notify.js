// Error notification helper.
// Logs the error clearly and, if SENDGRID_API_KEY or SMTP is configured,
// sends an email alert to the notification address in config.js.
//
// For now this uses a simple console approach. To wire up real email:
// Option A: Install nodemailer + configure SMTP vars in .env
// Option B: Use the SendGrid API — install @sendgrid/mail and set SENDGRID_API_KEY

function notifyError(error, config) {
  const ts = new Date().toISOString();
  const subject = `[HVAC Lead Gen] ERROR — ${ts}`;
  const body = [
    `An error occurred during the scheduled lead generation run.`,
    ``,
    `Time:    ${ts}`,
    `Error:   ${error.message}`,
    ``,
    `Stack:`,
    error.stack || '(no stack trace)',
    ``,
    `Action required: Check the logs and re-run manually with:`,
    `  node run-now.js`,
  ].join('\n');

  // Always log to console so server logs capture it.
  console.error('\n' + '─'.repeat(60));
  console.error(subject);
  console.error('─'.repeat(60));
  console.error(body);
  console.error('─'.repeat(60) + '\n');

  // ── Optional: send an email via nodemailer ────────────────────────────────
  // Uncomment and configure after installing nodemailer:
  //
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({
  //   host: process.env.SMTP_HOST,
  //   port: Number(process.env.SMTP_PORT) || 587,
  //   secure: false,
  //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // });
  // transporter.sendMail({
  //   from: process.env.SMTP_FROM || process.env.SMTP_USER,
  //   to: config.notificationEmail,
  //   subject,
  //   text: body,
  // }).catch(console.error);
}

module.exports = { notifyError };
