/**
 * run-lead-gen.js
 * Core lead generation logic — called by the scheduler (index.js)
 * and by the manual one-off runner (run-now.js).
 *
 * Flow:
 *   1. Search Apollo for HVAC decision-makers in SW Michigan
 *   2. Filter out contacts with no phone number
 *   3. Read existing business names from Google Sheet
 *   4. Filter out duplicates
 *   5. Append new leads (up to MAX_LEADS_PER_RUN)
 *   6. Log a summary
 */

'use strict';

const { searchHVACLeads }         = require('./apollo');
const { getExistingBusinessNames, ensureHeaderRow, appendLeads } = require('./sheets');
const { sendErrorAlert }           = require('./mailer');

/**
 * Runs one complete lead generation cycle.
 * Returns a summary object for the caller to log or display.
 */
async function runLeadGen() {
  const maxLeads = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);
  const startedAt = new Date();

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  HVAC Lead Gen  –  ${startedAt.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
  console.log('═══════════════════════════════════════════════════');

  let summary = {
    startedAt,
    apolloResults   : 0,
    duplicatesSkipped: 0,
    newLeadsAdded   : 0,
    error           : null,
  };

  try {
    // ── Step 1: Search Apollo ──────────────────────────────────────────────
    // Fetch more than we need to account for duplicates being filtered out
    const rawLeads = await searchHVACLeads(maxLeads * 2);
    summary.apolloResults = rawLeads.length;

    if (rawLeads.length === 0) {
      const msg = 'Apollo returned zero leads matching your criteria. Check filters or try again later.';
      console.warn(`[LeadGen] ${msg}`);
      await sendErrorAlert('No Apollo results', msg);
      summary.error = msg;
      return summary;
    }

    // ── Step 2: Ensure sheet has header row ───────────────────────────────
    await ensureHeaderRow();

    // ── Step 3: Read existing business names for dedup ────────────────────
    const existingNames = await getExistingBusinessNames();

    // ── Step 4: Filter duplicates ─────────────────────────────────────────
    const newLeads = [];
    for (const lead of rawLeads) {
      if (newLeads.length >= maxLeads) break;

      const nameKey = lead.businessName.trim().toLowerCase();

      if (!nameKey) {
        console.log('[LeadGen] Skipping lead with no business name');
        continue;
      }

      if (existingNames.has(nameKey)) {
        console.log(`[LeadGen] Duplicate — skipping "${lead.businessName}"`);
        summary.duplicatesSkipped++;
        continue;
      }

      newLeads.push(lead);
    }

    console.log(`[LeadGen] ${newLeads.length} new leads after dedup (${summary.duplicatesSkipped} duplicates skipped)`);

    // ── Step 5: Append to Google Sheet ────────────────────────────────────
    const written = await appendLeads(newLeads);
    summary.newLeadsAdded = written;

  } catch (err) {
    summary.error = err.message;
    console.error(`[LeadGen] ERROR: ${err.message}`);
    await sendErrorAlert(
      `Run failed: ${err.message.slice(0, 80)}`,
      `Full error:\n\n${err.stack || err.message}`
    );
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
  console.log('');
  console.log('── Run Summary ───────────────────────────────────');
  console.log(`   Apollo results   : ${summary.apolloResults}`);
  console.log(`   Duplicates skipped: ${summary.duplicatesSkipped}`);
  console.log(`   New leads added  : ${summary.newLeadsAdded}`);
  console.log(`   Elapsed          : ${elapsed}s`);
  if (summary.error) {
    console.log(`   ❌ Error         : ${summary.error}`);
  } else {
    console.log('   ✓  Run completed successfully');
  }
  console.log('─────────────────────────────────────────────────');
  console.log('');

  return summary;
}

module.exports = { runLeadGen };
