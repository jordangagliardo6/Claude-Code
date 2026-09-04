/**
 * Apollo Lead Gen — Main Entry Point
 *
 * Runs the lead generation workflow on a cron schedule (default: 7:00 AM ET daily).
 * Pass --run-now to execute immediately without waiting for the schedule.
 *
 * Usage:
 *   npm start            → start the scheduler (keeps running)
 *   npm run run-now      → run once right now (good for testing)
 *   npm run verify       → check API connections without writing to the sheet
 */

'use strict';

require('dotenv').config();

const cron = require('node-cron');

const { searchLeads }             = require('./apollo');
const { ensureHeaders, getExistingBusinessNames, appendLeads } = require('./sheets');
const { sendErrorNotification }   = require('./notify');

// ─── Settings (override via .env) ────────────────────────────────────────────

// How many new leads to add per morning run
const MAX_LEADS_PER_RUN = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// Cron expression — default is 7:00 AM every day
// See https://crontab.guru to craft a custom schedule
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 7 * * *';

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core workflow: search Apollo → deduplicate → write to Google Sheets.
 */
async function runWorkflow() {
  const runId = new Date().toISOString();
  console.log(`\n${'─'.repeat(55)}`);
  console.log(`[${runId}] Lead generation run starting…`);
  console.log(`${'─'.repeat(55)}`);

  try {
    // 1. Verify the sheet is accessible and has headers
    await ensureHeaders();
    console.log('✓ Google Sheets connection OK');

    // 2. Pull existing business names so we can skip duplicates
    const existingNames = await getExistingBusinessNames();
    console.log(`✓ ${existingNames.size} existing leads on file`);

    // 3. Search Apollo — fetch extra so we still hit MAX after filtering dupes
    const fetchLimit = MAX_LEADS_PER_RUN * 3;
    console.log(`→ Querying Apollo.io (requesting up to ${fetchLimit} contacts)…`);
    const rawLeads = await searchLeads(fetchLimit);
    console.log(`✓ Apollo returned ${rawLeads.length} contacts`);

    if (rawLeads.length === 0) {
      throw new Error(
        'Apollo returned 0 results. Check your API key, credits, and search filters.'
      );
    }

    // 4. Remove any business already in the sheet
    const newLeads = rawLeads
      .filter(lead => {
        const name = lead.businessName.toLowerCase().trim();
        return name && !existingNames.has(name);
      })
      .slice(0, MAX_LEADS_PER_RUN); // cap at daily limit

    console.log(`✓ ${newLeads.length} new (non-duplicate) leads to add`);

    if (newLeads.length === 0) {
      console.log('  Nothing to add — all Apollo results are already in the sheet.');
      console.log('  Tip: Apollo may be returning the same contacts. Try expanding');
      console.log('  the city list or industry keywords in apollo.js.');
      return;
    }

    // 5. Append to Google Sheets
    const added = await appendLeads(newLeads);
    console.log(`✓ Wrote ${added} new leads to Google Sheet`);

    // 6. Summary
    console.log(`\n  Run complete: +${added} leads added`);
    console.log(`  Sheet total: ~${existingNames.size + added} leads`);

  } catch (error) {
    await sendErrorNotification(error, 'runWorkflow');
    // Re-throw so the process exits non-zero if --run-now, but the
    // cron loop keeps running for the next scheduled fire.
    throw error;
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const runNow = process.argv.includes('--run-now');

if (runNow) {
  // Immediate one-shot run
  console.log('Running immediately (--run-now)…');
  runWorkflow().catch(err => {
    console.error('\nFatal error:', err.message);
    process.exit(1);
  });
} else {
  // Scheduled mode — keep the process alive
  console.log('Apollo Lead Gen — Scheduler starting…');
  console.log(`  Schedule : ${CRON_SCHEDULE}  (America/New_York)`);
  console.log(`  Max leads: ${MAX_LEADS_PER_RUN} per run`);
  console.log('\nWaiting for the next scheduled run. Press Ctrl+C to stop.');
  console.log('(Tip: run  npm run run-now  to trigger an immediate test run)\n');

  const job = cron.schedule(CRON_SCHEDULE, () => {
    runWorkflow().catch(err => {
      // sendErrorNotification already called inside runWorkflow
      console.error('Run failed:', err.message, '— scheduler still active for next run.');
    });
  }, {
    timezone: 'America/New_York',
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down scheduler…');
    job.destroy();
    process.exit(0);
  });
}
