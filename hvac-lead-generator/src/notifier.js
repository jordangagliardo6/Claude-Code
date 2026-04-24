'use strict';
const nodemailer = require('nodemailer');
const logger = require('./logger');
const config = require('./config');

// Sends an alert email if SMTP credentials are configured; otherwise logs only.
// The goal is to surface failures without crashing the scheduler.
async function sendAlert(subject, body) {
  logger.error(`ALERT: ${subject}`, { body });

  if (!config.notificationEmail || !config.smtpHost || !config.smtpUser || !config.smtpPass) {
    logger.warn('Email alert skipped — SMTP env vars not set. Check console/log for details.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

  try {
    await transporter.sendMail({
      from: config.smtpUser,
      to: config.notificationEmail,
      subject: `[HVAC Lead Generator] ${subject}`,
      text: body,
    });
    logger.info(`Alert email sent to ${config.notificationEmail}`);
  } catch (err) {
    // Email failure should never mask the original error.
    logger.error('Failed to send alert email', { err: err.message });
  }
}

// Sends a summary email after a successful run.
async function sendRunSummary(added, skipped) {
  if (!config.notificationEmail) return;

  const subject = `Run complete — ${added} leads added, ${skipped} skipped`;
  const body = [
    `Date: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`,
    `New leads added: ${added}`,
    `Duplicates skipped: ${skipped}`,
    '',
    'Check your spreadsheet for the new entries.',
  ].join('\n');

  await sendAlert(subject, body).catch(() => {}); // best-effort
}

module.exports = { sendAlert, sendRunSummary };
