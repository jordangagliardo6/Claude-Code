/**
 * leadgen.js
 * Core orchestration: search Apollo → deduplicate → write to Google Sheets.
 *
 * Call runLeadGeneration() directly or let index.js schedule it.
 */

require('dotenv').config();

const { searchHVACPeople, enrichWithPhones, formatLeads } = require('./apollo');
const { ensureHeaders, getExistingBusinessNames, appendLeads } = require('./sheets');
const { notifyError } = require('./notify');

/**
 * Main entry point.
 * Returns a summary object so test-connection.js and npm run-now can print results.
 */
async function runLeadGeneration() {
  const startedAt = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Lead Gen] Run started at ${startedAt}`);
  console.log('='.repeat(60));

  const maxLeads = Number(process.env.MAX_LEADS_PER_RUN ?? 25);

  try {
    // ── 1. Make sure the sheet has headers ──────────────────────────────────
    await ensureHeaders();

    // ── 2. Read existing business names to skip duplicates ──────────────────
    console.log('[Lead Gen] Reading existing leads from Google Sheets…');
    const existing = await getExistingBusinessNames();
    console.log(`[Lead Gen] ${existing.size} businesses already in sheet`);

    // ── 3. Search Apollo for candidates ─────────────────────────────────────
    console.log('[Lead Gen] Searching Apollo.io for HVAC leads…');
    const candidates = await searchHVACPeople(maxLeads * 3); // fetch extra; dedup + phone filter will shrink the list

    if (!candidates.length) {
      const msg = 'Apollo returned 0 candidates. No leads added this run.';
      console.warn(`[Lead Gen] ${msg}`);
      await notifyError('Apollo returned no results', msg);
      return { added: 0, skipped: 0, reason: 'no_candidates' };
    }

    // ── 4. Enrich to get phone numbers ───────────────────────────────────────
    console.log(`[Lead Gen] Enriching ${candidates.length} candidates for phone numbers…`);
    const enriched = await enrichWithPhones(candidates);

    // ── 5. Format into flat lead objects ─────────────────────────────────────
    const allLeads = formatLeads(enriched);
    console.log(`[Lead Gen] ${allLeads.length} leads after formatting`);

    // ── 6. Filter: must have a phone number ──────────────────────────────────
    const withPhone = allLeads.filter((l) => l.phone);
    console.log(`[Lead Gen] ${withPhone.length} leads have a phone number`);

    // ── 7. Deduplicate against sheet ─────────────────────────────────────────
    const newLeads = withPhone.filter(
      (l) => l.businessName && !existing.has(l.businessName.toLowerCase().trim())
    );
    const duplicateCount = withPhone.length - newLeads.length;
    console.log(`[Lead Gen] ${duplicateCount} duplicate(s) skipped, ${newLeads.length} new leads`);

    if (!newLeads.length) {
      console.log('[Lead Gen] No new leads to add this run.');
      return { added: 0, skipped: duplicateCount, reason: 'all_duplicates' };
    }

    // ── 8. Cap at maxLeads ───────────────────────────────────────────────────
    const toAdd = newLeads.slice(0, maxLeads);

    // ── 9. Build rows in spreadsheet column order ────────────────────────────
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });

    const rows = toAdd.map((lead) => [
      today,           // A: Date Added
      lead.businessName, // B: Business Name
      lead.firstName,  // C: Owner First Name
      lead.lastName,   // D: Owner Last Name
      lead.phone,      // E: Phone Number
      lead.city,       // F: City
      lead.website,    // G: Website
      '',              // H: Called (blank)
      '',              // I: Notes (blank)
    ]);

    // ── 10. Write to sheet ───────────────────────────────────────────────────
    console.log(`[Lead Gen] Appending ${rows.length} leads to Google Sheets…`);
    await appendLeads(rows);

    const summary = {
      added: rows.length,
      skipped: duplicateCount,
      noPhone: allLeads.length - withPhone.length,
      runAt: startedAt,
    };

    console.log('\n[Lead Gen] Run complete:', summary);
    return summary;

  } catch (err) {
    await notifyError('Lead generation run failed', err);
    throw err;
  }
}

module.exports = { runLeadGeneration };
