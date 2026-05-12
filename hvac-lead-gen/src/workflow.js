// Main workflow — called by the scheduler (or manually via --run-once)
// Orchestrates: Apollo fetch → dedup → Sheets append → error notification

const apollo  = require('./apollo');
const sheets  = require('./sheets');
const logger  = require('./logger');
const config  = require('./config');

// Send an error alert. Currently logs to console + file.
// To wire up email, install nodemailer and replace the body of this function.
function notifyError(context, err) {
  const msg = `WORKFLOW ERROR [${context}]: ${err.message || err}`;
  logger.error(msg);
  logger.error('Action required: check workflow.log and rerun manually if needed.');

  // --- Optional email alert (uncomment and configure nodemailer to enable) ---
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({ ... });
  // transporter.sendMail({
  //   from: process.env.ALERT_EMAIL,
  //   to:   process.env.ALERT_EMAIL,
  //   subject: 'HVAC Lead Gen Workflow Error',
  //   text:  msg,
  // });
}

async function run() {
  logger.info('=== HVAC lead generation workflow started ===');

  // ── Step 1: Fetch leads from Apollo ──────────────────────────────────────
  let leads;
  try {
    leads = await apollo.fetchLeads(config.apollo.maxLeadsPerRun);
  } catch (err) {
    notifyError('Apollo fetch', err);
    return;
  }

  if (leads.length === 0) {
    logger.warn('Apollo returned no usable leads for this run.');
    notifyError('Apollo result', new Error('Zero leads returned — check filters or API quota.'));
    return;
  }

  logger.info(`Fetched ${leads.length} lead(s) from Apollo.`);

  // ── Step 2: Append to Google Sheets ──────────────────────────────────────
  let stats;
  try {
    stats = await sheets.appendLeads(leads);
  } catch (err) {
    notifyError('Google Sheets write', err);
    return;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  logger.success(
    `Run complete — ${stats.added} added, ${stats.skipped} skipped (duplicates).`
  );
  logger.info('=== Workflow finished ===');
}

module.exports = { run };
