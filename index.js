/**
 * HVAC Lead Generation Scheduler
 *
 * Runs every morning at 7:00 AM Eastern Time.
 * Each run:
 *   1. Reads existing business names from Google Sheets (for dedup)
 *   2. Searches Apollo.io for HVAC owners in SW Michigan
 *   3. Filters out contacts with no phone and duplicates
 *   4. Appends up to MAX_LEADS_PER_RUN new rows to the sheet
 *   5. Emails an alert if anything fails
 *
 * Usage:
 *   npm start                    — start the scheduler (runs at 7 AM ET daily)
 *   RUN_NOW=true npm start       — run one cycle immediately, then keep scheduling
 *   npm run test-connection      — verify Apollo + Sheets are reachable before first run
 */

require('dotenv').config();

const cron = require('node-cron');
const { searchLeads } = require('./src/apollo');
const { ensureHeaders, getExistingBusinessNames, appendLeads } = require('./src/sheets');
const { sendErrorAlert } = require('./src/mailer');

// ── Configuration ─────────────────────────────────────────────────────────────
// Maximum new leads to add per run — keeps the daily list manageable.
const MAX_LEADS_PER_RUN = 25;

// Cron expression: every day at 07:00 AM (node-cron uses the timezone option below)
const CRON_SCHEDULE = '0 7 * * *';
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One full lead-generation cycle.
 */
async function runLeadGen() {
  const startedAt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Run started: ${startedAt} ET`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // Step 1 — Make sure the sheet has the right header row
    console.log('  [1/4] Checking spreadsheet headers...');
    await ensureHeaders();

    // Step 2 — Load all existing business names so we can skip duplicates
    console.log('  [2/4] Loading existing leads from Google Sheets...');
    const existingNames = await getExistingBusinessNames();
    console.log(`        ${existingNames.size} existing business(es) on file`);

    // Step 3 — Search Apollo
    // We fetch more than MAX_LEADS_PER_RUN to account for entries that will be
    // filtered out as duplicates or phone-less contacts.
    console.log('  [3/4] Searching Apollo.io for HVAC leads in SW Michigan...');
    const { leads: rawLeads, totalCount } = await searchLeads(1, 100);

    if (!rawLeads || rawLeads.length === 0) {
      const msg = 'Apollo.io returned 0 results for the SW Michigan HVAC search.';
      console.warn(`  WARNING: ${msg}`);
      await sendErrorAlert('No Results from Apollo', msg);
      return;
    }
    console.log(`        Apollo found ${rawLeads.length} contacts with phones (${totalCount} total available)`);

    // Step 4 — Deduplicate and cap
    const newLeads = rawLeads.filter(lead => {
      if (!lead.phone)         return false; // no phone — skip
      if (!lead.businessName)  return false; // no business name — skip
      const key = lead.businessName.trim().toLowerCase();
      return !existingNames.has(key);        // already in sheet — skip
    });

    console.log(`        ${newLeads.length} new lead(s) after filtering duplicates`);

    if (newLeads.length === 0) {
      console.log('  No new leads to add this run. Finished.');
      return;
    }

    // Cap at daily limit (keep the top-priority titles first — already sorted)
    const batch = newLeads.slice(0, MAX_LEADS_PER_RUN);

    console.log(`  [4/4] Writing ${batch.length} lead(s) to Google Sheets...`);
    const written = await appendLeads(batch);

    console.log(`\n  ✓ Done — ${written} new lead(s) added to your spreadsheet.`);
    if (newLeads.length > MAX_LEADS_PER_RUN) {
      console.log(`  (${newLeads.length - MAX_LEADS_PER_RUN} additional new leads were found but held back for tomorrow's run.)`);
    }
  } catch (err) {
    const msg = err.message || String(err);
    console.error(`\n  ✗ Error: ${msg}`);
    if (err.stack) console.error(err.stack);
    await sendErrorAlert('Workflow Error', msg + (err.stack ? `\n\n${err.stack}` : ''));
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────
console.log('╔══════════════════════════════════════════════╗');
console.log('║   HVAC Lead Generation — Scheduler Ready     ║');
console.log('╚══════════════════════════════════════════════╝');
console.log(`  Schedule : daily at 7:00 AM Eastern Time`);
console.log(`  Max leads: ${MAX_LEADS_PER_RUN} per run`);
console.log(`  Cities   : St. Joseph, Benton Harbor, Kalamazoo,`);
console.log(`             Holland, Grand Haven, Muskegon, South Haven`);
console.log('  Press Ctrl+C to stop.\n');

// Optional: run one cycle immediately when starting the process
if (process.env.RUN_NOW === 'true') {
  console.log('  RUN_NOW=true — executing one cycle now...');
  runLeadGen();
}

// Schedule the daily run
cron.schedule(CRON_SCHEDULE, runLeadGen, {
  timezone: 'America/New_York',
});
