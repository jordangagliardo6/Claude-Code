'use strict';
const nodemailer = require('nodemailer');

// Logs the error to console and, if email credentials are set, sends an alert email.
async function notifyError(err) {
  const message = err instanceof Error ? (err.stack || err.message) : String(err);
  const timestamp = new Date().toISOString();

  console.error(`\n[${timestamp}] LEAD GEN RUN FAILED:\n${message}\n`);

  const to = process.env.NOTIFICATION_EMAIL;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_PASS;

  if (!to || !user || !pass) {
    console.warn('Email notification skipped — NOTIFICATION_EMAIL / GMAIL_USER / GMAIL_PASS not set.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: user,
      to,
      subject: `Apollo Lead Gen — Run Failed (${timestamp})`,
      text: `Your daily HVAC lead gen run failed at ${timestamp}.\n\nError details:\n\n${message}\n\nCheck the server logs for more context.`,
    });
    console.log(`Alert email sent to ${to}`);
  } catch (mailErr) {
    console.error('Failed to send error email:', mailErr.message);
  }
}

module.exports = { notifyError };
