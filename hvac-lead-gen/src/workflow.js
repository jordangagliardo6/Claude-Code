/**
 * Main workflow orchestration
 *
 * Sequence:
 *   1. Ensure the Google Sheet has a header row
 *   2. Load existing business names (duplicate guard)
 *   3. Search Apollo.io for HVAC decision-makers in SW Michigan
 *   4. Enrich candidates with phone numbers (skip those with none)
 *   5. Deduplicate against the sheet
 *   6. Append new leads (up to MAX_LEADS_PER_RUN)
 *   7. Log results; email on error if SMTP is configured
 */

const { searchHvacPeople, enrichWithPhones, extractLead } = require('./apollo');
const { ensureHeaders, getExistingBusinessNames, appendLeads } = require('./sheets');
const { logError } = require('./notify');

const MAX_LEADS_PER_RUN = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// Fetch 3× the desired lead count to allow for no-phone and duplicate filtering
const FETCH_MULTIPLIER = 3;

function ts() {
  return new Date().toISOString();
}

/**
 * Run one complete lead generation cycle.
 * Returns a summary object: { added, skippedNoPhone, skippedDuplicate }
 */
async function runWorkflow() {
  const runStart = Date.now();
  console.log(`\n[${ts()}] ═══ HVAC Lead Generation Run Starting ═══`);
  console.log(`[${ts()}] Config: max ${MAX_LEADS_PER_RUN} leads per run`);

  try {
    // ── Step 1: Headers ──────────────────────────────────────────────────────
    await ensureHeaders();

    // ── Step 2: Load existing leads ──────────────────────────────────────────
    console.log(`[${ts()}] Loading existing leads from Google Sheets...`);
    const existingNames = await getExistingBusinessNames();
    console.log(`[${ts()}] ${existingNames.size} existing business(es) in sheet.`);

    // ── Step 3: Search Apollo ────────────────────────────────────────────────
    const fetchCount = MAX_LEADS_PER_RUN * FETCH_MULTIPLIER;
    console.log(`[${ts()}] Searching Apollo.io (requesting up to ${fetchCount} candidates)...`);
    const candidates = await searchHvacPeople(fetchCount);
    console.log(`[${ts()}] Apollo returned ${candidates.length} candidate(s).`);

    if (!candidates.length) {
      const msg =
        'Apollo.io returned 0 results. ' +
        'Check your APOLLO_API_KEY and verify your plan supports People Search.';
      console.warn(`[${ts()}] WARNING: ${msg}`);
      await logError(msg);
      return { added: 0, skippedNoPhone: 0, skippedDuplicate: 0 };
    }

    // ── Step 4: Enrich with phones ───────────────────────────────────────────
    console.log(`[${ts()}] Enriching ${candidates.length} contacts with phone numbers...`);
    const enriched = await enrichWithPhones(candidates);
    console.log(`[${ts()}] Enrichment returned ${enriched.length} record(s).`);

    if (!enriched.length) {
      const msg =
        'Phone enrichment returned 0 results. ' +
        'Your Apollo plan may not include phone reveals — requires Basic ($49/mo) or higher.';
      console.warn(`[${ts()}] WARNING: ${msg}`);
      await logError(msg);
      return { added: 0, skippedNoPhone: candidates.length, skippedDuplicate: 0 };
    }

    // ── Step 5: Filter — no phone and duplicates ─────────────────────────────
    const newLeads = [];
    let skippedNoPhone = 0;
    let skippedDuplicate = 0;

    for (const person of enriched) {
      if (newLeads.length >= MAX_LEADS_PER_RUN) break;

      const lead = extractLead(person);

      if (!lead) {
        skippedNoPhone++;
        continue;
      }

      if (!lead.businessName) {
        skippedNoPhone++; // no org data — not useful
        continue;
      }

      if (existingNames.has(lead.businessName.toLowerCase().trim())) {
        skippedDuplicate++;
        continue;
      }

      newLeads.push(lead);
    }

    console.log(`[${ts()}] ${newLeads.length} new lead(s) ready.`);
    console.log(
      `[${ts()}] Filtered out: ${skippedNoPhone} (no phone), ${skippedDuplicate} (already in sheet)`
    );

    if (!newLeads.length) {
      console.log(`[${ts()}] Nothing new to add this run — sheet is current.`);
      return { added: 0, skippedNoPhone, skippedDuplicate };
    }

    // ── Step 6: Write to sheet ───────────────────────────────────────────────
    console.log(`[${ts()}] Writing ${newLeads.length} lead(s) to Google Sheets...`);
    const added = await appendLeads(newLeads);

    const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
    console.log(`[${ts()}] ═══ Run Complete in ${elapsed}s ═══`);
    console.log(
      `[${ts()}] Added: ${added} | No-phone skips: ${skippedNoPhone} | Duplicate skips: ${skippedDuplicate}`
    );

    return { added, skippedNoPhone, skippedDuplicate };

  } catch (err) {
    console.error(`[${ts()}] FATAL: ${err.message}`);
    console.error(err.stack);
    await logError(`Workflow run failed: ${err.message}`, err);
    throw err;
  }
}

module.exports = { runWorkflow };
