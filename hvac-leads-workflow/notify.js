/**
 * Error notification — sends a Gmail alert when the workflow fails.
 * Uses nodemailer with a Gmail App Password (no OAuth needed).
 * Falls back to console-only if GMAIL_APP_PASSWORD is not set.
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

async function sendErrorEmail(message) {
  const email    = process.env.NOTIFICATION_EMAIL;
  const password = process.env.GMAIL_APP_PASSWORD;

  if (!email || !password) {
    console.warn('  ⚠  Email alerts not configured (set NOTIFICATION_EMAIL + GMAIL_APP_PASSWORD in .env)');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: email, pass: password },
  });

  await transporter.sendMail({
    from: email,
    to:   email,
    subject: '⚠ HVAC Lead Workflow Error',
    text: [
      'Your automated HVAC lead workflow encountered an error and stopped.',
      '',
      `Error: ${message}`,
      '',
      `Time: ${new Date().toISOString()}`,
      '',
      'Check the server console for the full stack trace.',
      'Fix the issue and re-run: node index.js',
    ].join('\n'),
  });

  console.log(`  ✓ Error alert sent to ${email}`);
}

module.exports = { sendErrorEmail };
