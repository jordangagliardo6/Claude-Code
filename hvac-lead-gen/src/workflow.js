// Core workflow: fetch leads from Apollo, dedup, write to Google Sheet
const { fetchLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const logger = require('./logger');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN ?? '25', 10);

async function runWorkflow() {
  const startTime = Date.now();
  logger.info('═══ Starting HVAC Lead Generation Workflow ═══');

  // ── Step 1: Pull leads from Apollo ──
  let leads = [];
  try {
    leads = await fetchLeads(MAX_LEADS);
  } catch (err) {
    const msg = `Apollo search failed: ${err.message}`;
    logger.error(msg, { stack: err.stack });
    await sendErrorAlert(msg);
    return { success: false, error: msg };
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned 0 leads with phone numbers for the current filters';
    logger.warn(msg);
    await sendErrorAlert(msg);
    return { success: false, error: msg };
  }

  // ── Step 2: Write new leads to Google Sheet ──
  let result = { added: 0, skipped: 0 };
  try {
    result = await appendLeads(leads);
  } catch (err) {
    const msg = `Google Sheet write failed: ${err.message}`;
    logger.error(msg, { stack: err.stack });
    await sendErrorAlert(msg);
    return { success: false, error: msg };
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(
    `═══ Workflow complete (${elapsed}s) — ${result.added} added, ${result.skipped} duplicates skipped ═══`
  );
  return { success: true, ...result };
}

// Send an email alert if SMTP vars are configured; always logs to console/file
async function sendErrorAlert(message) {
  const to = process.env.ALERT_EMAIL;
  if (!to) return; // email alerts are optional

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from:    process.env.SMTP_USER,
      to,
      subject: '[HVAC Lead Gen] Workflow Error',
      text:    `The HVAC lead generation workflow encountered an error:\n\n${message}\n\nCheck the logs: logs/workflow.log`,
    });

    logger.info(`Error alert emailed to ${to}`);
  } catch (emailErr) {
    logger.warn(`Failed to send alert email: ${emailErr.message}`);
  }
}

module.exports = { runWorkflow };
