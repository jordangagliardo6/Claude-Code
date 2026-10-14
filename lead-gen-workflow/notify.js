/**
 * notify.js — Error notification via email
 *
 * Sends a Gmail alert when the workflow encounters an error.
 * Uses Nodemailer with Gmail SMTP + App Password (no OAuth required for sending).
 *
 * If email credentials are not configured, falls back to console.error only.
 */

const nodemailer = require('nodemailer');

/**
 * Sends an error notification email.
 *
 * @param {string} subject   Short description of the error
 * @param {string} body      Full error details
 */
async function notifyError(subject, body) {
  const from = process.env.NOTIFY_FROM_EMAIL;
  const password = process.env.NOTIFY_EMAIL_PASSWORD;
  const to = process.env.NOTIFY_TO_EMAIL || from;

  // Always log to console
  console.error(`\n[ERROR ALERT] ${subject}`);
  console.error(body);
  console.error('─'.repeat(60));

  // Attempt email only if credentials are configured
  if (!from || !password) {
    console.warn(
      'Email notification skipped — set NOTIFY_FROM_EMAIL and NOTIFY_EMAIL_PASSWORD in .env to enable.'
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: from, pass: password },
  });

  const html = `
    <h2 style="color:#c0392b;">Lead Gen Workflow Error</h2>
    <p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</p>
    <p><strong>Error:</strong> ${escapeHtml(subject)}</p>
    <hr/>
    <pre style="background:#f4f4f4;padding:12px;border-radius:4px;">${escapeHtml(body)}</pre>
    <p style="color:#7f8c8d;font-size:12px;">
      This alert was sent by the Apollo HVAC Lead Gen script.<br/>
      Check the console output or run <code>node index.js --run-now</code> to retry.
    </p>
  `;

  try {
    await transporter.sendMail({
      from: `"Lead Gen Bot" <${from}>`,
      to,
      subject: `[Lead Gen] Error: ${subject}`,
      html,
    });
    console.log(`  Error notification sent to ${to}.`);
  } catch (emailErr) {
    console.error(`  Failed to send email notification: ${emailErr.message}`);
    console.error('  Make sure NOTIFY_EMAIL_PASSWORD is a Gmail App Password (not your account password).');
    console.error('  Generate one at: https://myaccount.google.com/apppasswords');
  }
}

/**
 * Sends a success summary email (optional — only if configured).
 * Call this at end of run to confirm results.
 */
async function notifySuccess(leadsAdded, leadsSkipped, totalFromApollo) {
  const from = process.env.NOTIFY_FROM_EMAIL;
  const password = process.env.NOTIFY_EMAIL_PASSWORD;
  const to = process.env.NOTIFY_TO_EMAIL || from;

  if (!from || !password) return; // silent if not configured

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: from, pass: password },
  });

  const html = `
    <h2 style="color:#27ae60;">Lead Gen Run Complete</h2>
    <p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</p>
    <table style="border-collapse:collapse;">
      <tr><td style="padding:4px 12px 4px 0;"><strong>Leads from Apollo:</strong></td><td>${totalFromApollo}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><strong>New leads added:</strong></td><td style="color:#27ae60;font-weight:bold;">${leadsAdded}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><strong>Duplicates skipped:</strong></td><td>${leadsSkipped}</td></tr>
    </table>
    <p style="color:#7f8c8d;font-size:12px;">Apollo HVAC Lead Gen — SW Michigan HVAC</p>
  `;

  try {
    await transporter.sendMail({
      from: `"Lead Gen Bot" <${from}>`,
      to,
      subject: `[Lead Gen] ${leadsAdded} new leads added`,
      html,
    });
  } catch {
    // Success emails are best-effort; don't throw
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { notifyError, notifySuccess };
