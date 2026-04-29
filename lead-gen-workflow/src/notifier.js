/**
 * Error notifier
 *
 * Sends an email alert when the workflow fails.  Uses nodemailer with Gmail
 * SMTP (App Password flow).  If email credentials are not configured, falls
 * back to a loud console banner so the error is never silently swallowed.
 *
 * Required env vars for email alerts (all optional — workflow still runs):
 *   ALERT_EMAIL_TO      Destination address (e.g. you@example.com)
 *   ALERT_EMAIL_FROM    Gmail address used as sender
 *   ALERT_EMAIL_PASS    Gmail App Password (NOT your regular password)
 */

'use strict';

const logger = require('./logger');

async function sendErrorAlert(subject, body) {
  const to   = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  const pass = process.env.ALERT_EMAIL_PASS;

  // ── Console banner (always shown) ──────────────────────────────────────────
  logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.error(`WORKFLOW ALERT: ${subject}`);
  logger.error(body);
  logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!to || !from || !pass) {
    logger.warn(
      'Email alert skipped — set ALERT_EMAIL_TO, ALERT_EMAIL_FROM, and ALERT_EMAIL_PASS to enable.'
    );
    return;
  }

  // ── Email via Gmail SMTP ───────────────────────────────────────────────────
  try {
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: from, pass },
    });

    await transporter.sendMail({
      from: `"Lead Gen Workflow" <${from}>`,
      to,
      subject: `[Lead Gen] ${subject}`,
      text: [
        `An error occurred in the HVAC Lead Generation Workflow.`,
        '',
        subject,
        '',
        body,
        '',
        `Time: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`,
        `Check logs/ directory for full details.`,
      ].join('\n'),
    });

    logger.info(`Error alert email sent to ${to}`);
  } catch (emailErr) {
    logger.error(`Failed to send alert email: ${emailErr.message}`);
  }
}

module.exports = { sendErrorAlert };
