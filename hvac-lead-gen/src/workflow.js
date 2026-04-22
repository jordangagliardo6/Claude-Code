// Core workflow — can be run standalone (node src/workflow.js) or called by
// the scheduler in index.js.
require('dotenv').config();
const logger = require('./logger');
const { searchHVACLeads } = require('./apollo');
const { getAuthClient, ensureHeaders, appendLeads } = require('./sheets');
const { loadState, saveState } = require('./state');

const MAX_LEADS_PER_RUN = 25;

async function runWorkflow() {
  const startedAt = new Date().toISOString();
  logger.info('══════════════════════════════════════════════');
  logger.info('  HVAC Lead Generation — Run started');
  logger.info(`  Time: ${startedAt}`);
  logger.info('══════════════════════════════════════════════');

  // ── 1. Load persisted page state ───────────────────────────────────────────
  const state = loadState();
  logger.info(`Resuming from Apollo page ${state.currentPage} (${state.totalLeadsPulled} total leads pulled so far)`);

  // ── 2. Search Apollo ────────────────────────────────────────────────────────
  let leads = [];
  try {
    leads = await searchHVACLeads(state.currentPage, MAX_LEADS_PER_RUN);
  } catch (err) {
    await notifyError(`Apollo.io search failed: ${err.message}`);
    return;
  }

  if (leads.length === 0) {
    const msg =
      state.currentPage > 1
        ? `Apollo page ${state.currentPage} returned no results — resetting to page 1 for next run`
        : 'Apollo returned no results for this run';
    logger.warn(msg);
    // Reset page so the next run tries page 1 fresh
    saveState({ currentPage: 1 });
    await notifyError(msg);
    return;
  }

  // ── 3. Write to Google Sheets ───────────────────────────────────────────────
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    await notifyError('GOOGLE_SPREADSHEET_ID is not set in .env');
    return;
  }

  let addedCount = 0;
  try {
    const auth = await getAuthClient();
    await ensureHeaders(auth, spreadsheetId);
    addedCount = await appendLeads(auth, spreadsheetId, leads);
  } catch (err) {
    await notifyError(`Google Sheets write failed: ${err.message}`);
    return;
  }

  // ── 4. Advance state ────────────────────────────────────────────────────────
  const nextPage = leads.length < MAX_LEADS_PER_RUN
    ? 1  // Apollo ran out of results on this page — wrap around
    : state.currentPage + 1;

  saveState({
    currentPage: nextPage,
    totalLeadsPulled: state.totalLeadsPulled + addedCount,
  });

  logger.info('──────────────────────────────────────────────');
  logger.info(`  Run complete — ${addedCount} new lead(s) added`);
  logger.info(`  Next run will start on Apollo page ${nextPage}`);
  logger.info('──────────────────────────────────────────────');
}

// ─── Error notifications ──────────────────────────────────────────────────────

async function notifyError(message) {
  logger.error(`[NOTIFICATION] ${message}`);
  console.error('\n╔══════════════════════════════════════════════╗');
  console.error('║  ERROR — Manual review required              ║');
  console.error('╚══════════════════════════════════════════════╝');
  console.error(`  ${message}`);
  console.error('  Check logs/combined.log for full details.\n');

  // ── Optional email alert ────────────────────────────────────────────────────
  // To enable: npm install nodemailer, fill ALERT_EMAIL + ALERT_EMAIL_PASSWORD
  // in .env, then uncomment the block below.
  /*
  const nodemailer = require('nodemailer');
  if (!process.env.ALERT_EMAIL || !process.env.ALERT_EMAIL_PASSWORD) return;
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.ALERT_EMAIL,
        pass: process.env.ALERT_EMAIL_PASSWORD, // Use a Gmail App Password
      },
    });
    await transporter.sendMail({
      from: process.env.ALERT_EMAIL,
      to: process.env.ALERT_EMAIL,
      subject: '⚠️  HVAC Lead Gen — Error Alert',
      text: `An error occurred during the automated lead generation run:\n\n${message}\n\nCheck logs/combined.log for details.`,
    });
    logger.info('Error alert email sent');
  } catch (emailErr) {
    logger.error('Failed to send alert email', { error: emailErr.message });
  }
  */
}

// Allow direct execution: node src/workflow.js
if (require.main === module) {
  runWorkflow().catch(err => {
    logger.error('Unhandled error in workflow', { error: err.message });
    process.exit(1);
  });
}

module.exports = { runWorkflow };
