/**
 * HVAC Lead Generation Workflow — Scheduler
 *
 * Runs automatically every morning at 7:00 AM Eastern Time.
 * Pulls up to 25 new HVAC leads from Apollo.io for Southwest Michigan,
 * deduplicates against the master Google Sheet, and appends new entries.
 *
 * Setup:
 *   1. cp .env.example .env  → fill in your keys
 *   2. Add credentials.json (Google OAuth2) to this directory
 *   3. npm install
 *   4. node index.js          → starts the scheduler (runs at 7am ET daily)
 *   5. node index.js --run-now → test a single run immediately
 *
 * First run: will open a browser for Google OAuth consent and save token.json.
 * All subsequent runs are fully headless.
 */

require('dotenv').config();

const cron = require('node-cron');
const path = require('path');
const { runWorkflow } = require('./src/workflow');

// ─── Configuration ────────────────────────────────────────────────────────────

const config = {
  apolloApiKey: process.env.APOLLO_API_KEY,
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  credentialsPath: path.resolve(__dirname, process.env.GOOGLE_CREDENTIALS_FILE || './credentials.json'),
  tokenPath: path.resolve(__dirname, process.env.GOOGLE_TOKEN_FILE || './token.json'),
  maxLeads: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  notifyEmail: process.env.NOTIFY_EMAIL,
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validateConfig() {
  const missing = [];
  if (!config.apolloApiKey) missing.push('APOLLO_API_KEY');
  if (!config.spreadsheetId) missing.push('GOOGLE_SHEET_ID');
  if (missing.length > 0) {
    console.error(`ERROR: Missing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example → .env and fill in your credentials.');
    process.exit(1);
  }
}

// ─── Single Workflow Run ───────────────────────────────────────────────────────

async function runOnce() {
  validateConfig();
  const startTime = Date.now();

  try {
    const result = await runWorkflow(config);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n─── Run Summary ───────────────────────────────');
    console.log(`  Date:          ${new Date().toISOString().split('T')[0]}`);
    console.log(`  Apollo results: ${result.total}`);
    console.log(`  Added to sheet: ${result.added}`);
    console.log(`  Skipped (dupe/no phone): ${result.skipped}`);
    console.log(`  Elapsed:        ${elapsed}s`);

    if (result.leads.length > 0) {
      console.log('\n  New leads added:');
      result.leads.forEach((l, i) => {
        console.log(`  ${i + 1}. ${l.businessName} — ${l.city} — ${l.phone}`);
      });
    }

    console.log('───────────────────────────────────────────────\n');
    return result;
  } catch (err) {
    console.error('\n[ERROR] Workflow failed:', err.message);

    // Log the full error for debugging
    if (err.response?.data) {
      console.error('Apollo response:', JSON.stringify(err.response.data, null, 2));
    }

    // Console alert (extendable to email via nodemailer or SendGrid)
    console.error(
      `\n⚠️  HVAC LEAD WORKFLOW ERROR — ${new Date().toISOString()}\n` +
      `Please check manually. Error: ${err.message}\n` +
      `Notification email: ${config.notifyEmail || '(not configured)'}`
    );

    throw err;
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

// Cron: "0 7 * * *" = 7:00 AM every day
// America/New_York = Eastern Time (handles DST automatically)
const CRON_SCHEDULE = '0 7 * * *';
const TIMEZONE = 'America/New_York';

function startScheduler() {
  validateConfig();

  if (!cron.validate(CRON_SCHEDULE)) {
    console.error('Invalid cron schedule:', CRON_SCHEDULE);
    process.exit(1);
  }

  console.log(`HVAC Lead Workflow scheduler started.`);
  console.log(`Schedule: ${CRON_SCHEDULE} (${TIMEZONE}) — runs daily at 7:00 AM Eastern`);
  console.log(`Sheet ID: ${config.spreadsheetId}`);
  console.log(`Max leads per run: ${config.maxLeads}`);
  console.log('Waiting for next scheduled run... (Ctrl+C to stop)\n');

  cron.schedule(CRON_SCHEDULE, async () => {
    console.log(`\n[${new Date().toISOString()}] Cron triggered — starting run...`);
    try {
      await runOnce();
    } catch (err) {
      // Error already logged inside runOnce; keep the scheduler alive
      console.error('[Scheduler] Run failed, will retry at next scheduled time.');
    }
  }, { timezone: TIMEZONE });
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--run-now');

if (runNow) {
  console.log('Running immediately (--run-now flag detected)...\n');
  runOnce()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  startScheduler();
}
