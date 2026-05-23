'use strict';

const nodemailer = require('nodemailer');
const config = require('./config');

function canEmail() {
  return !!(config.SMTP_USER && config.SMTP_PASS && config.NOTIFY_EMAIL_TO);
}

function buildTransport() {
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });
}

/**
 * Log an error to the console and optionally email it.
 * Always safe to call — email failures are swallowed and re-logged.
 */
async function notifyError(context, err) {
  const message = `[HVAC Lead Gen ERROR] ${context}: ${err.message || err}`;
  console.error(message);
  if (err.stack) console.error(err.stack);

  if (!canEmail()) {
    console.warn('[notifier] SMTP not configured — skipping email alert. Set SMTP_USER, SMTP_PASS, and NOTIFY_EMAIL_TO to enable.');
    return;
  }

  try {
    const transport = buildTransport();
    await transport.sendMail({
      from: `"HVAC Lead Gen Bot" <${config.NOTIFY_EMAIL_FROM}>`,
      to: config.NOTIFY_EMAIL_TO,
      subject: `⚠️ HVAC Lead Gen Error: ${context}`,
      text: [
        `An error occurred during the HVAC lead generation workflow.`,
        ``,
        `Context: ${context}`,
        `Error: ${err.message || err}`,
        ``,
        err.stack || '',
        ``,
        `Time: ${new Date().toISOString()}`,
      ].join('\n'),
    });
    console.log(`[notifier] Error alert emailed to ${config.NOTIFY_EMAIL_TO}`);
  } catch (emailErr) {
    console.error(`[notifier] Could not send error email: ${emailErr.message}`);
  }
}

/**
 * Send a success summary after a clean run.
 */
async function notifySuccess({ added, skipped, total }) {
  const summary = `[HVAC Lead Gen] Run complete — ${added} new leads added, ${skipped} duplicates skipped (${total} pulled from Apollo).`;
  console.log(summary);

  if (!canEmail()) return;

  try {
    const transport = buildTransport();
    await transport.sendMail({
      from: `"HVAC Lead Gen Bot" <${config.NOTIFY_EMAIL_FROM}>`,
      to: config.NOTIFY_EMAIL_TO,
      subject: `✅ HVAC Lead Gen: ${added} new leads added`,
      text: [
        summary,
        ``,
        `Time: ${new Date().toISOString()}`,
        `Spreadsheet: https://docs.google.com/spreadsheets/d/${config.SPREADSHEET_ID}/edit`,
      ].join('\n'),
    });
  } catch (emailErr) {
    console.error(`[notifier] Could not send success email: ${emailErr.message}`);
  }
}

module.exports = { notifyError, notifySuccess };
