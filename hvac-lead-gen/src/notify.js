/**
 * notify.js — Error and success alerts.
 *
 * If SMTP_USER + SMTP_PASS + ALERT_EMAIL are all set, sends email via
 * nodemailer. Otherwise, falls back to a console log so the run never
 * crashes just because notifications aren't configured.
 */

const nodemailer = require('nodemailer');

function buildTransport() {
  const { SMTP_USER, SMTP_PASS, SMTP_HOST, SMTP_PORT } = process.env;
  if (!SMTP_USER || !SMTP_PASS) return null;

  const port = parseInt(SMTP_PORT || '587', 10);
  return nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendEmail(subject, body) {
  const to = process.env.ALERT_EMAIL;
  const from = process.env.SMTP_USER;
  const transport = buildTransport();

  if (!transport || !to) return; // email not configured — skip silently

  try {
    await transport.sendMail({
      from,
      to,
      subject: `[HVAC Lead Gen] ${subject}`,
      text: body,
    });
    console.log(`  Email alert sent to ${to}`);
  } catch (err) {
    // Email failure should not mask the original error — just log it
    console.error(`  Could not send email alert: ${err.message}`);
  }
}

async function notifyError(title, detail) {
  const msg =
    `HVAC Lead Generator — Error\n\n` +
    `${title}\n${'─'.repeat(40)}\n${detail}\n\n` +
    `Timestamp: ${new Date().toISOString()}\n\n` +
    `Check console logs or re-run with: node index.js --run-now`;

  console.error(`  [ALERT] ${title}: ${detail}`);
  await sendEmail(`ERROR: ${title}`, msg);
}

async function notifySuccess(added, skippedFromBatch) {
  const msg =
    `HVAC Lead Gen run completed.\n\n` +
    `New leads added this run : ${added}\n` +
    `Skipped (batch overflow) : ${skippedFromBatch}\n\n` +
    `Timestamp: ${new Date().toISOString()}`;

  if (added > 0) {
    // Only email on success when there is something to report
    await sendEmail(`${added} new HVAC lead${added === 1 ? '' : 's'} added`, msg);
  }
}

module.exports = { notifyError, notifySuccess };
