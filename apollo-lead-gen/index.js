/**
 * index.js — Lead generation scheduler.
 *
 * Runs daily at 7:00 AM Eastern Time, pulls up to 25 HVAC leads from Apollo.io
 * for Southwest Michigan, and appends new contacts to a Google Sheet.
 *
 * Usage:
 *   node index.js             → start the scheduler (runs daily at 7am ET)
 *   node index.js --run-now   → run immediately (one-shot, no scheduler)
 *
 * See .env.example for required environment variables.
 */

require('dotenv').config();
const cron = require('node-cron');
const { searchHVACLeads } = require('./apollo');
const { getExistingBusinessNames, appendLeads } = require('./sheets');

// How many new leads to pull per run. Adjust here if you want more or fewer.
const LEADS_PER_RUN = 25;

// ── Scheduler ─────────────────────────────────────────────────────────────────

// "0 7 * * *" = 7:00 AM every day.
// The `timezone` option handles EST/EDT automatically — no manual UTC math needed.
cron.schedule('0 7 * * *', () => {
  runLeadGen().catch(err => {
    // Error is already logged inside runLeadGen. Re-catch here keeps node alive
    // so the scheduler continues to fire on future days.
    console.error(`[SCHEDULER] Run failed — see above. Scheduler remains active for tomorrow.\n`);
  });
}, {
  timezone: 'America/New_York',
});

// ── Core workflow ──────────────────────────────────────────────────────────────

async function runLeadGen() {
  const startTime = new Date();
  log(`========== Lead Gen Run Starting ==========`);

  try {
    // Step 1: Read existing business names to drive duplicate detection.
    log(`[1/4] Loading existing leads from Google Sheets...`);
    const existingNames = await getExistingBusinessNames();
    log(`      ${existingNames.size} existing businesses on record.`);

    // Step 2: Search Apollo and enrich results for phone numbers.
    log(`[2/4] Searching Apollo.io for HVAC leads in SW Michigan...`);
    // Fetch extra candidates so filtering still yields LEADS_PER_RUN after dedup.
    const candidates = await searchHVACLeads(LEADS_PER_RUN * 2);
    log(`      ${candidates.length} candidates with phone numbers found.`);

    if (candidates.length === 0) {
      log('[WARN] Apollo returned no results with phone numbers.');
      log('       Possible causes: API key invalid, credit limit reached, or no new leads in the area.');
      log('       Check your Apollo account and run again with --run-now to test.');
      return;
    }

    // Step 3: Remove businesses already in the sheet.
    log(`[3/4] Removing duplicates...`);
    const newLeads = candidates.filter(
      lead => !existingNames.has(lead.businessName.toLowerCase().trim())
    );
    const toAdd = newLeads.slice(0, LEADS_PER_RUN);

    const dupCount = candidates.length - newLeads.length;
    log(`      Removed ${dupCount} duplicate(s). ${toAdd.length} new lead(s) to add.`);

    if (toAdd.length === 0) {
      log('      All results already exist in the sheet. No new rows added.');
      log(`========== Run Complete (0 new leads) ==========\n`);
      return;
    }

    // Step 4: Append new leads to Google Sheets.
    log(`[4/4] Writing ${toAdd.length} lead(s) to Google Sheets...`);
    await appendLeads(toAdd);
    log(`      Done.`);

    const elapsed = ((new Date() - startTime) / 1000).toFixed(1);
    log(`========== Run Complete: ${toAdd.length} new lead(s) added in ${elapsed}s ==========\n`);

  } catch (err) {
    logError(err);
    throw err; // Re-throw so the scheduler catch-block can log a clean summary line.
  }
}

// ── Logging helpers ────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

function logError(err) {
  console.error(`\n[${ts()}] ========== RUN FAILED ==========`);
  console.error(`[${ts()}] Error: ${err.message}`);

  if (err.response?.status) {
    console.error(`[${ts()}] HTTP Status: ${err.response.status}`);
  }
  if (err.response?.data) {
    console.error(`[${ts()}] API Response:`, JSON.stringify(err.response.data, null, 2));
  }

  console.error(`[${ts()}] ─── ACTION REQUIRED ───────────────────────────────`);
  console.error(`[${ts()}] Check the error above and resolve it manually.`);
  console.error(`[${ts()}] Re-run: node index.js --run-now`);
  console.error(`[${ts()}] ===================================================\n`);
}

function ts() {
  return new Date().toISOString();
}

// ── Entry point ────────────────────────────────────────────────────────────────

if (process.argv.includes('--run-now')) {
  log('Manual run triggered via --run-now');
  runLeadGen()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  log('Scheduler started — lead gen runs daily at 7:00 AM Eastern Time.');
  log('To run immediately: node index.js --run-now');
}

module.exports = { runLeadGen };
