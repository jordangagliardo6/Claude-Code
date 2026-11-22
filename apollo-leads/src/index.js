/**
 * Entry point — runs the lead generation workflow on a cron schedule.
 *
 * Usage:
 *   node src/index.js          → starts the scheduler (7 AM Eastern daily)
 *   node src/index.js --now    → runs immediately (use to test / on-demand)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const cron = require('node-cron');
const { searchLeads, extractLeadData } = require('./apollo');
const { appendLeads } = require('./sheets');
const logger = require('./logger');
const config = require('./config');

// ── Validation ────────────────────────────────────────────────────────────────

function validateEnv() {
  const missing = [];
  if (!process.env.APOLLO_API_KEY)  missing.push('APOLLO_API_KEY');
  if (!process.env.GOOGLE_SHEET_ID) missing.push('GOOGLE_SHEET_ID');

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Copy .env.example to .env and fill in your values.'
    );
  }
}

// ── Core workflow ─────────────────────────────────────────────────────────────

async function runWorkflow() {
  logger.info('════ Lead generation workflow started ════');

  try {
    validateEnv();

    // 1. Search Apollo for contacts matching our filters
    logger.info(`Searching Apollo.io — max ${config.maxLeadsPerRun} leads, SW Michigan HVAC...`);
    const rawPeople = await searchLeads();

    if (!rawPeople.length) {
      const msg = 'Apollo returned 0 results — no leads found for this run';
      logger.warn(msg);
      await handleError(msg, null);
      return;
    }

    // 2. Map to our lead shape and drop anyone without a phone number
    const leads = rawPeople
      .map(extractLeadData)
      .filter(l => l.phoneNumber.length > 0);

    logger.info(
      `${rawPeople.length} contacts from Apollo → ${leads.length} have phone numbers`,
    );

    if (!leads.length) {
      logger.warn('No leads with phone numbers found this run — try removing has_phone filter in apollo.js to see raw counts');
      return;
    }

    // 3. Write to Google Sheet (deduplication handled inside appendLeads)
    const added = await appendLeads(leads);
    logger.info(`════ Run complete — ${added} new lead(s) added ════`);

  } catch (err) {
    await handleError(err.message, err);
  }
}

// ── Error handling ────────────────────────────────────────────────────────────

async function handleError(message, err) {
  logger.error('════ WORKFLOW ERROR — ACTION REQUIRED ════');
  logger.error(message, err);
  logger.error(`Log file: ${logger.logFile}`);
  logger.error('Check your APOLLO_API_KEY, credentials.json, GOOGLE_SHEET_ID, and internet connection.');

  // ── Optional: email alert via Gmail MCP / nodemailer ─────────────────────
  // Uncomment and configure if you want email notifications on failure.
  // Requires ALERT_EMAIL in your .env and nodemailer set up (see README).
  //
  // const nodemailer = require('nodemailer');
  // const transporter = nodemailer.createTransport({ ... });
  // await transporter.sendMail({
  //   from: process.env.ALERT_EMAIL,
  //   to:   process.env.ALERT_EMAIL,
  //   subject: '[Lead Gen] Workflow error — check logs',
  //   text: `Error at ${new Date().toISOString()}:\n\n${message}`,
  // });
}

// ── Scheduler / entry ─────────────────────────────────────────────────────────

if (process.argv.includes('--now')) {
  // Immediate one-shot run — useful for testing and on-demand pulls
  runWorkflow().catch(err => {
    logger.error('Fatal unhandled error', err);
    process.exit(1);
  });
} else {
  // Scheduled mode: 7:00 AM every day, America/New_York timezone
  logger.info('Scheduler active — workflow runs daily at 7:00 AM Eastern');
  logger.info('Tip: run  node src/index.js --now  to execute immediately');

  cron.schedule('0 7 * * *', () => {
    logger.info('Scheduled trigger fired');
    runWorkflow().catch(err => logger.error('Unhandled error in scheduled run', err));
  }, {
    timezone: 'America/New_York',
  });
}
