/**
 * HVAC Lead Generator — Southwest Michigan
 *
 * Searches Apollo.io for HVAC/plumbing/mechanical companies with 1-25 employees
 * in Southwest Michigan, deduplicates against an existing Google Sheet, and
 * appends up to MAX_LEADS_PER_RUN new leads each morning at 7:00 AM Eastern.
 *
 * Usage:
 *   node index.js              → start scheduler (runs daily at 7 AM ET)
 *   node index.js --run-now   → trigger one run immediately and exit
 *   node setup.js             → verify API connections before first scheduled run
 */

require('dotenv').config();

const cron = require('node-cron');
const { searchHvacLeads } = require('./apollo');
const { getExistingBusinessNames, appendLeads, ensureHeader } = require('./sheets');
const { sendErrorNotification, logSuccess } = require('./notify');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// ─── Core run logic ──────────────────────────────────────────────────────────

async function runLeadGeneration() {
  const runDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${new Date().toISOString()}] Starting lead generation run`);
  console.log(`Target: ${MAX_LEADS} new leads max`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // Make sure the header row exists (safe to call every run)
    await ensureHeader();

    // 1. Load existing business names for dedup (lowercase Set)
    const existing = await getExistingBusinessNames();
    console.log(`[Sheets] Existing businesses in sheet: ${existing.size}`);

    // 2. Pull candidates from Apollo — fetch 3× the target to survive dedup losses
    const candidates = await searchHvacLeads(MAX_LEADS * 3);
    console.log(`[Apollo] Candidates returned: ${candidates.length}`);

    // 3. Filter: skip duplicates, must have a phone number
    const newLeads = candidates
      .filter((lead) => lead.phone)
      .filter((lead) => !existing.has(lead.businessName.toLowerCase().trim()))
      .slice(0, MAX_LEADS);

    console.log(`[Filter] New unique leads with phone: ${newLeads.length}`);

    if (newLeads.length === 0) {
      console.log('[Result] No new leads to add this run.');
      return;
    }

    // 4. Build rows in the sheet's column order
    const rows = newLeads.map((lead) => [
      runDate,
      lead.businessName,
      lead.firstName,
      lead.lastName,
      lead.phone,
      lead.city,
      lead.website,
      '',  // Called — left blank for manual tracking
      '',  // Notes  — left blank for manual tracking
    ]);

    // 5. Append to sheet
    await appendLeads(rows);
    logSuccess(rows.length, existing.size);

  } catch (err) {
    await sendErrorNotification(err.message, err);
    process.exitCode = 1;
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

// Cron: minute=0, hour=7, every day — timezone pinned to America/New_York
// so it always fires at 7:00 AM ET regardless of DST.
cron.schedule('0 7 * * *', runLeadGeneration, {
  timezone: 'America/New_York',
});

console.log('HVAC Lead Generator started.');
console.log('Scheduled: 7:00 AM Eastern daily');
console.log('Run `node index.js --run-now` to trigger immediately.\n');

// ─── Immediate run flag ───────────────────────────────────────────────────────

if (process.argv.includes('--run-now') || process.argv.includes('--test')) {
  runLeadGeneration().then(() => {
    // Give async cleanup a moment, then exit so the process doesn't hang
    setTimeout(() => process.exit(process.exitCode || 0), 500);
  });
}
