/**
 * index.js — HVAC Lead Generation Scheduler
 *
 * Pulls up to 25 new HVAC leads per day from Apollo.io and writes them
 * to your Google Spreadsheet. Skips duplicates automatically.
 *
 * Usage:
 *   npm start            → start the 7 AM Eastern daily scheduler
 *   npm run run-now      → test a single pull immediately (no schedule)
 *   npm run authorize    → one-time Google OAuth setup
 */

require('dotenv').config();

const cron             = require('node-cron');
const { searchHvacLeads } = require('./src/apollo');
const { appendLeads }    = require('./src/sheets');

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_LEADS_PER_RUN  = 25;
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL ?? '';

// Cron expression: 7:00 AM every day.
// node-cron v3 supports the `timezone` option, so this is always Eastern time
// regardless of where the server is hosted.
const CRON_SCHEDULE = '0 7 * * *';
const CRON_TIMEZONE = 'America/New_York';

// ─── Core run logic ───────────────────────────────────────────────────────────

async function runLeadPull() {
  const runId    = Date.now();
  const startMsg = `[${new Date().toISOString()}] Run #${runId} — HVAC lead pull starting`;
  console.log(startMsg);
  console.log('─'.repeat(60));

  try {
    // Step 1: Search Apollo.io
    console.log(`Searching Apollo.io for SW Michigan HVAC leads (max ${MAX_LEADS_PER_RUN})...`);
    const leads = await searchHvacLeads(MAX_LEADS_PER_RUN);

    if (leads.length === 0) {
      handleNoResults(runId);
      return;
    }

    console.log(`${leads.length} leads with phone numbers retrieved from Apollo.`);

    // Step 2: Write to Google Sheets
    console.log('Writing to Google Sheets...');
    const { written, skipped } = await appendLeads(leads);

    console.log('─'.repeat(60));
    console.log(`✓ Run complete: ${written} new leads added, ${skipped} duplicates skipped.`);
    console.log(`  Next run: tomorrow at 7:00 AM Eastern.`);

  } catch (err) {
    handleError(runId, err);
  }
}

// ─── Error / no-result handling ───────────────────────────────────────────────

function handleNoResults(runId) {
  const alert = {
    runId,
    timestamp: new Date().toISOString(),
    code:      'NO_RESULTS',
    message:   'Apollo returned 0 results. Possible causes: API key invalid, rate limit hit, or no new leads match the filters.',
    action:    'Check your APOLLO_API_KEY and Apollo usage dashboard.',
    notifyEmail: NOTIFICATION_EMAIL || '(not configured)',
  };
  console.warn('[ALERT — NO RESULTS]', JSON.stringify(alert, null, 2));
  // → To send a real email, replace the log above with an SMTP call, e.g.:
  //   sendEmail(NOTIFICATION_EMAIL, 'Lead pull: 0 results', alert.message);
}

function handleError(runId, err) {
  const alert = {
    runId,
    timestamp: new Date().toISOString(),
    code:      'RUN_FAILED',
    message:   err.message,
    stack:     err.stack,
    action:    'Check logs above for details. The next run will try again at 7 AM.',
    notifyEmail: NOTIFICATION_EMAIL || '(not configured)',
  };
  console.error('[ALERT — RUN FAILED]', JSON.stringify(alert, null, 2));
  // → Replace with real alerting as needed:
  //   sendEmail(NOTIFICATION_EMAIL, 'Lead pull FAILED', alert.message);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

if (require.main === module) {
  if (process.argv[2] === '--run-now') {
    // Immediate single run — useful for testing and first-time setup.
    runLeadPull().then(() => process.exit(0)).catch(err => {
      console.error(err);
      process.exit(1);
    });

  } else {
    // Scheduled mode: stay alive and fire at 7 AM Eastern every day.
    console.log('HVAC Lead Scheduler started.');
    console.log(`Schedule: daily at 7:00 AM Eastern (${CRON_TIMEZONE})`);
    console.log('Tip: run "npm run run-now" in a separate terminal to test immediately.\n');

    cron.schedule(CRON_SCHEDULE, runLeadPull, { timezone: CRON_TIMEZONE });
  }
}

module.exports = { runLeadPull };
