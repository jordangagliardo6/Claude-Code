/**
 * index.js — HVAC Lead Gen Scheduler
 *
 * Starts a node-cron job that fires at 7:00 AM Eastern every morning.
 * Each run:
 *   1. Searches Apollo for HVAC decision-makers in Southwest Michigan
 *   2. Deduplicates against the existing Google Sheet
 *   3. Appends up to MAX_LEADS_PER_RUN new rows
 *   4. Logs any errors to error.log
 *
 * To run immediately (without waiting for 7 AM): node run-now.js
 * To run the scheduler daemon:                   node index.js
 */

require('dotenv').config();
const cron = require('node-cron');

const { searchLeads }               = require('./apollo');
const { ensureHeaders,
        getExistingBusinessNames,
        appendRows,
        leadToRow }                 = require('./sheets');
const { logError, trimLog }         = require('./logger');
const config                        = require('./config');

// ── MAIN JOB ─────────────────────────────────────────────────────────────────

/**
 * Execute one complete lead generation run.
 * Called by the cron scheduler and also by run-now.js for manual tests.
 */
async function runLeadGenJob() {
  const runAt = new Date().toLocaleString('en-US', { timeZone: config.TIMEZONE });
  const divider = '═'.repeat(60);

  console.log(`\n${divider}`);
  console.log(`  HVAC Lead Gen — Run started at ${runAt}`);
  console.log(divider);

  // Housekeeping: trim error log before each run
  trimLog(500);

  try {
    validateEnv();

    // Guarantee header row exists before any read/write
    await ensureHeaders();

    // Load existing business names for dedup
    const existingNames = await getExistingBusinessNames();
    console.log(`[Sheets] ${existingNames.size} existing businesses on record.`);

    // ── APOLLO SEARCH ──────────────────────────────────────────
    let apolloLeads = [];
    let page        = 1;

    // Pull pages until we have enough candidates or Apollo is exhausted
    while (apolloLeads.length < config.MAX_LEADS_PER_RUN) {
      const batch = await searchLeads(page);
      if (!batch.length) break;      // Apollo returned nothing — stop paging
      apolloLeads = apolloLeads.concat(batch);
      if (batch.length < config.MAX_LEADS_PER_RUN) break; // last page
      page++;
    }

    if (!apolloLeads.length) {
      const msg =
        'Apollo returned 0 results. Check your API key, plan limits, and search filters.';
      logError('NO_RESULTS', msg);
      return;
    }

    console.log(`[Apollo] ${apolloLeads.length} total candidate(s) across ${page} page(s).`);

    // ── DEDUPLICATION ──────────────────────────────────────────
    const newLeads = apolloLeads.filter(lead => {
      const key = lead.businessName.toLowerCase().trim();
      // Drop blank names and anything already in the sheet
      return key.length > 0 && !existingNames.has(key);
    });

    console.log(
      `[Job] ${apolloLeads.length} from Apollo → ` +
      `${apolloLeads.length - newLeads.length} duplicate(s) removed → ` +
      `${newLeads.length} new lead(s).`
    );

    if (!newLeads.length) {
      console.log('[Job] Nothing new to add. All Apollo results already exist in the sheet.');
      return;
    }

    // ── WRITE TO SHEET ─────────────────────────────────────────
    const toAdd     = newLeads.slice(0, config.MAX_LEADS_PER_RUN);
    const dateAdded = new Date().toLocaleDateString('en-US', { timeZone: config.TIMEZONE });
    const rows      = toAdd.map(lead => leadToRow(lead, dateAdded));

    await appendRows(rows);

    // ── SUMMARY ────────────────────────────────────────────────
    console.log(`\n✓ Added ${rows.length} new lead(s):\n`);
    toAdd.forEach(l =>
      console.log(`  + ${padRight(l.businessName, 35)}  ${padRight(l.city, 15)}  ${l.phone}`)
    );

  } catch (err) {
    logError('JOB_FAILED', err.message);
  }

  console.log(`\n${divider}\n`);
}

// ── VALIDATION ───────────────────────────────────────────────────────────────

function validateEnv() {
  const required = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}\n` +
      `Copy .env.example → .env and fill in your values.`
    );
  }
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function padRight(str, len) {
  return (str || '').padEnd(len).slice(0, len);
}

// ── SCHEDULER ────────────────────────────────────────────────────────────────

console.log('[Scheduler] HVAC Lead Gen starting…');
console.log(`[Scheduler] Schedule: "${config.CRON_SCHEDULE}" (${config.TIMEZONE})`);
console.log('[Scheduler] Next automatic run: 7:00 AM Eastern.');
console.log('[Scheduler] To run right now: node run-now.js\n');

cron.schedule(config.CRON_SCHEDULE, runLeadGenJob, {
  scheduled: true,
  timezone:  config.TIMEZONE,
});

// Graceful shutdown on Ctrl-C or SIGTERM (e.g. from PM2 / systemd)
process.on('SIGINT',  () => { console.log('\n[Scheduler] Shutting down.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n[Scheduler] Shutting down.'); process.exit(0); });

// Export for use by run-now.js and setup.js
module.exports = { runLeadGenJob };
