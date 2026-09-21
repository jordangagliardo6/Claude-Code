/**
 * Core lead generation logic — runs one pull cycle.
 *
 * Called by index.js on schedule, or directly via `node run-once.js`.
 */

const { searchHvacLeads } = require('./apollo');
const { getExistingBusinessNames, ensureHeaders, appendLeads } = require('./sheets');
const { log, warn, alertError } = require('./logger');
const config = require('./config');

async function runLeadGeneration() {
  log('=== HVAC Lead Generation Starting ===');
  log(`Target: SW Michigan HVAC, max ${config.apollo.maxLeadsPerRun} new leads`);

  // Step 1 — ensure sheet has headers
  log('Step 1/4: Verifying Google Sheet headers...');
  await ensureHeaders();

  // Step 2 — read existing businesses for dedup
  log('Step 2/4: Loading existing business names for deduplication...');
  const existing = await getExistingBusinessNames();
  log(`  Found ${existing.size} existing businesses in sheet`);

  // Step 3 — fetch leads from Apollo
  log('Step 3/4: Searching Apollo.io for new HVAC leads...');
  const rawLeads = await searchHvacLeads();
  log(`  Apollo returned ${rawLeads.length} leads with phone numbers`);

  if (rawLeads.length === 0) {
    warn('Apollo returned 0 results. The search may need adjustment or the plan may require upgrade.');
    await alertError(
      'No results from Apollo (Sept 21 run)',
      'Apollo returned 0 HVAC leads for Southwest Michigan.\n\n' +
      'Possible reasons:\n' +
      '  1. Apollo plan needs upgrade to access prospecting API\n' +
      '  2. Filters are too narrow — consider expanding cities or industry tags\n' +
      '  3. Apollo rate limit hit — try again in a few hours\n\n' +
      `Config: ${JSON.stringify({ cities: config.apollo.targetCities.slice(0,3), max: config.apollo.maxLeadsPerRun }, null, 2)}`
    );
    return { added: 0, skipped: 0, total: 0 };
  }

  // Step 4 — deduplicate and append
  log('Step 4/4: Deduplicating and writing new leads...');
  const newLeads = rawLeads.filter(lead => {
    const name = lead.company.toLowerCase().trim();
    if (!name) return false;
    if (existing.has(name)) {
      log(`  Skipping duplicate: "${lead.company}"`);
      return false;
    }
    return true;
  });

  const skipped = rawLeads.length - newLeads.length;
  log(`  ${newLeads.length} new leads after dedup (${skipped} duplicates removed)`);

  if (newLeads.length === 0) {
    log('No new leads to add — all results were already in the sheet.');
    return { added: 0, skipped, total: rawLeads.length };
  }

  const appended = await appendLeads(newLeads);
  log(`  ✓ Appended ${appended} new rows to sheet`);

  // Print a summary to console
  log('--- New Leads Added ---');
  newLeads.forEach((l, i) => {
    log(`  ${i + 1}. ${l.company} | ${l.firstName} ${l.lastName} | ${l.phone} | ${l.city}`);
  });

  log(`=== Done: ${appended} added, ${skipped} skipped as duplicates ===`);
  return { added: appended, skipped, total: rawLeads.length };
}

module.exports = { runLeadGeneration };
