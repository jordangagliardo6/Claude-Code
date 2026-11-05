/**
 * index.js – Entry point and scheduler for the HVAC lead scraper.
 *
 * Usage:
 *   node index.js              → starts the scheduler (runs at 7am ET daily)
 *   node index.js --run-now    → runs one scrape immediately, then schedules
 *   node setup.js              → first-run connectivity check (run before this)
 */
require('dotenv').config();
const cron = require('node-cron');
const { fetchHVACLeads } = require('./apollo');
const { appendLeads } = require('./sheets');
const { sendErrorAlert } = require('./notify');
const config = require('./config');

// ── Core scrape function ──────────────────────────────────────────────────────

async function runScrape() {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Scraper] Run started at ${timestamp} ET`);
  console.log('='.repeat(60));

  let leads = [];

  // Step 1 – Pull leads from Apollo.io
  try {
    leads = await fetchHVACLeads();
    console.log(`[Scraper] Apollo returned ${leads.length} qualifying lead(s)`);
  } catch (err) {
    const msg = `Apollo.io search failed: ${err.message}`;
    await sendErrorAlert('Apollo search failed', `${msg}\n\nTimestamp: ${timestamp}`);
    return; // abort this run; don't attempt to write partial data
  }

  if (leads.length === 0) {
    const msg = 'Apollo returned 0 results for the configured filters.';
    console.warn(`[Scraper] ${msg}`);
    await sendErrorAlert('No leads returned', `${msg}\n\nCheck your Apollo filters in config.js.\nTimestamp: ${timestamp}`);
    return;
  }

  // Step 2 – Append to Google Sheets (deduplicated)
  let result;
  try {
    result = await appendLeads(leads);
  } catch (err) {
    const msg = `Google Sheets write failed: ${err.message}`;
    await sendErrorAlert('Google Sheets write failed', `${msg}\n\nTimestamp: ${timestamp}`);
    return;
  }

  console.log(`\n[Scraper] Done. Added: ${result.added} | Skipped (dupes): ${result.skipped}`);
  console.log(`[Scraper] Run complete at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET\n`);
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

function startScheduler() {
  const { cron: cronExpr, timezone } = config.schedule;

  console.log(`[Scheduler] Registered: "${cronExpr}" (${timezone})`);
  console.log('[Scheduler] Next run: 7:00 AM Eastern Time daily');
  console.log('[Scheduler] Waiting… (keep this process running)\n');

  cron.schedule(cronExpr, () => {
    runScrape().catch((err) => {
      console.error('[Scheduler] Unexpected error in runScrape:', err);
    });
  }, { timezone });
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  const runNow = process.argv.includes('--run-now');

  if (runNow) {
    console.log('[Scraper] --run-now flag detected; executing immediately...');
    await runScrape();
  }

  startScheduler();
})();
