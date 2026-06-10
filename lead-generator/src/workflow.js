/**
 * workflow.js — Core lead-generation logic
 *
 * Orchestrates: Apollo search → dedup check → optional enrichment →
 * priority sort → Google Sheets append.
 *
 * Called by the scheduler (index.js) and the one-shot runner (run-now.js).
 */

'use strict';

const { searchHVACLeads, enrichPersonPhone, extractPhone, mapToLead, TARGET_TITLES } = require('./apollo');
const { ensureHeaders, getExistingBusinessNames, appendLeads } = require('./sheets');
const { sendErrorNotification } = require('./notify');

const MAX_LEADS = () => parseInt(process.env.MAX_LEADS_PER_RUN, 10) || 25;
const ENRICHMENT_ENABLED = () => process.env.ENABLE_ENRICHMENT === 'true';

// Milliseconds to pause between enrichment calls to respect Apollo rate limits
const ENRICHMENT_DELAY_MS = 600;

/**
 * Run one full lead-generation cycle.
 *
 * @returns {Promise<{ added: number, skipped: number, error?: string }>}
 */
async function runWorkflow() {
  const startTime = Date.now();
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${new Date().toISOString()}] HVAC lead generation run started`);
  console.log(`  Max leads this run : ${MAX_LEADS()}`);
  console.log(`  Enrichment enabled : ${ENRICHMENT_ENABLED()}`);
  console.log(`${'─'.repeat(60)}`);

  try {
    // ── Step 1: Prepare the spreadsheet ──────────────────────────────────────
    console.log('\n[1/4] Verifying Google Sheet headers…');
    await ensureHeaders();

    // ── Step 2: Load existing businesses for dedup ────────────────────────────
    console.log('[2/4] Loading existing business names for deduplication…');
    const existingNames = await getExistingBusinessNames();
    console.log(`  ${existingNames.size} existing businesses on file.`);

    // ── Step 3: Search Apollo ─────────────────────────────────────────────────
    console.log('[3/4] Searching Apollo.io for HVAC leads in Southwest Michigan…');
    const searchResult = await searchHVACLeads(1, 100);

    const rawPeople = searchResult?.people ?? [];
    const totalFound = searchResult?.pagination?.total_entries ?? rawPeople.length;
    console.log(`  Apollo found ${totalFound} total prospects; processing first ${rawPeople.length}.`);

    if (rawPeople.length === 0) {
      const msg = 'Apollo search returned 0 results. The filters may be too narrow or your API key may lack access.';
      console.warn(`  ${msg}`);
      await sendErrorNotification('Apollo: No Results', msg);
      return { added: 0, skipped: 0, error: msg };
    }

    // ── Step 4: Filter, enrich, dedup, sort ───────────────────────────────────
    console.log('[4/4] Processing prospects…');

    const newLeads = [];
    let skippedNoPhone = 0;
    let skippedDuplicate = 0;
    let skippedIncomplete = 0;
    let enrichedCount = 0;

    for (const person of rawPeople) {
      // Stop once we have enough for this run
      if (newLeads.length >= MAX_LEADS()) break;

      // Attempt to get phone from the search result first (no credit cost)
      let phone = extractPhone(person);

      // If missing and enrichment is on, call the paid enrichment endpoint
      if (!phone && ENRICHMENT_ENABLED()) {
        const enriched = await enrichPersonPhone(person);
        if (enriched) {
          phone = extractPhone(enriched);
          // Merge enriched fields back so mapToLead() picks them up
          Object.assign(person, enriched);
          enrichedCount++;
        }
        // Respect rate limits
        await delay(ENRICHMENT_DELAY_MS);
      }

      if (!phone) {
        skippedNoPhone++;
        continue;
      }

      const lead = mapToLead(person);

      // Require at minimum a business name and a first name
      if (!lead.businessName || !lead.firstName) {
        skippedIncomplete++;
        continue;
      }

      // Deduplicate against the existing sheet
      if (existingNames.has(lead.businessName.toLowerCase().trim())) {
        console.log(`  Duplicate skipped : ${lead.businessName}`);
        skippedDuplicate++;
        continue;
      }

      newLeads.push(lead);
    }

    // Sort by title priority (Owner first, General Manager last)
    newLeads.sort((a, b) => a.titleRank - b.titleRank);

    console.log(`\n  Results:`);
    console.log(`    New leads found   : ${newLeads.length}`);
    console.log(`    No phone          : ${skippedNoPhone}`);
    console.log(`    Duplicates        : ${skippedDuplicate}`);
    console.log(`    Incomplete data   : ${skippedIncomplete}`);
    if (ENRICHMENT_ENABLED()) {
      console.log(`    Enriched (credits): ${enrichedCount}`);
    }

    // ── Step 5: Write to Google Sheets ────────────────────────────────────────
    if (newLeads.length > 0) {
      const added = await appendLeads(newLeads);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n  ✓ Added ${added} new leads to Google Sheets. (${elapsed}s)`);

      // Print a summary table to the console
      printLeadSummary(newLeads);

      return { added, skipped: skippedNoPhone + skippedDuplicate + skippedIncomplete };
    } else {
      console.log('\n  No new leads to add this run.');
      return { added: 0, skipped: skippedNoPhone + skippedDuplicate + skippedIncomplete };
    }

  } catch (err) {
    const msg = `Workflow error: ${err.message}`;
    console.error(`\n  FAILED: ${msg}`);
    if (err.response?.data) {
      console.error('  API response:', JSON.stringify(err.response.data, null, 2));
    }

    await sendErrorNotification('Workflow Failed', msg).catch(() => {});
    return { added: 0, skipped: 0, error: msg };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printLeadSummary(leads) {
  console.log('\n  Leads added:');
  console.log('  ' + '─'.repeat(80));
  console.log(
    `  ${'Business Name'.padEnd(30)} ${'First'.padEnd(12)} ${'Last'.padEnd(12)} ${'City'.padEnd(15)} Phone`
  );
  console.log('  ' + '─'.repeat(80));
  for (const l of leads) {
    const biz = l.businessName.slice(0, 29).padEnd(30);
    const fn  = l.firstName.slice(0, 11).padEnd(12);
    const ln  = l.lastName.slice(0, 11).padEnd(12);
    const city = l.city.slice(0, 14).padEnd(15);
    console.log(`  ${biz} ${fn} ${ln} ${city} ${l.phone}`);
  }
  console.log('  ' + '─'.repeat(80));
}

module.exports = { runWorkflow };
