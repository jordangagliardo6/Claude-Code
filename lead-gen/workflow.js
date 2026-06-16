/**
 * workflow.js
 * Orchestrates a single lead generation run:
 *   1. Load existing business names from the sheet (dedup check)
 *   2. Page through Apollo search results
 *   3. For each new contact, attempt to retrieve a phone number
 *   4. Collect up to MAX_LEADS_PER_RUN leads that have a phone number
 *   5. Append them to the Google Sheet
 *
 * Phone number strategy:
 *   - First check if Apollo's search result already includes a phone (free).
 *   - If not, call the People Match endpoint to enrich (costs 1 Apollo credit).
 *   - Skip the lead entirely if no phone is found after enrichment.
 */

const { searchHVACPeople, enrichPersonPhone } = require('./apollo');
const { getExistingBusinessNames, appendLeads } = require('./sheets');
const { logError, sendErrorNotification } = require('./logger');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN, 10) || 25;
// Hard cap on search pages to avoid runaway loops (50 results/page × 20 pages = 1,000 candidates)
const MAX_SEARCH_PAGES = 20;
// Small delay between enrichment calls to stay within Apollo rate limits (ms)
const ENRICH_DELAY_MS = 500;

/**
 * Extract the best available phone number from a person object.
 * Prefers direct/mobile over other types; falls back to sanitized_phone.
 */
function extractPhone(person) {
  if (!person) return null;

  const phones = person.phone_numbers || [];
  const preferred = phones.find((p) =>
    ['direct', 'mobile', 'work_direct'].includes(p?.type)
  );
  if (preferred) return preferred.sanitized_number || preferred.raw_number;
  if (phones.length > 0) return phones[0].sanitized_number || phones[0].raw_number;

  return person.sanitized_phone || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWorkflow() {
  const runStart = new Date();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`HVAC Lead Gen — run started at ${runStart.toISOString()}`);
  console.log(`${'═'.repeat(60)}\n`);

  // ── Step 1: Load existing names for duplicate detection ──────────────────
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames();
    console.log(`Loaded ${existingNames.size} existing businesses from sheet.\n`);
  } catch (err) {
    const msg = `Cannot read Google Sheet: ${err.message}`;
    logError(msg, err);
    await sendErrorNotification(msg);
    return;
  }

  // ── Step 2: Page through Apollo search results ───────────────────────────
  const newLeads = [];
  let page = 1;
  let totalCandidates = 0;
  let skippedDuplicates = 0;
  let skippedNoPhone = 0;

  while (newLeads.length < MAX_LEADS && page <= MAX_SEARCH_PAGES) {
    console.log(`Searching Apollo — page ${page}...`);

    let searchData;
    try {
      searchData = await searchHVACPeople(page, 50);
    } catch (err) {
      const msg = `Apollo search failed on page ${page}: ${err.message}`;
      logError(msg, err);
      await sendErrorNotification(msg);
      break;
    }

    const people = searchData.people || [];
    totalCandidates += people.length;

    if (people.length === 0) {
      console.log('Apollo returned no more results.');
      break;
    }

    console.log(`  → ${people.length} results on page ${page}`);

    for (const person of people) {
      if (newLeads.length >= MAX_LEADS) break;

      const bizName = person.organization?.name?.trim();
      if (!bizName) continue;

      // ── Duplicate check ─────────────────────────────────────────────────
      if (existingNames.has(bizName.toLowerCase())) {
        skippedDuplicates++;
        continue;
      }

      // ── Phone resolution ────────────────────────────────────────────────
      let phone = extractPhone(person);

      if (!phone) {
        // Enrich to get phone (1 credit per matched person)
        await sleep(ENRICH_DELAY_MS);
        try {
          const enriched = await enrichPersonPhone(person);
          phone = extractPhone(enriched);
        } catch (err) {
          console.warn(
            `  Enrichment failed for ${person.first_name} ${person.last_name} @ ${bizName}: ${err.message}`
          );
        }
      }

      if (!phone) {
        skippedNoPhone++;
        continue;
      }

      // ── Build lead record ────────────────────────────────────────────────
      const lead = {
        dateAdded: runStart.toLocaleDateString('en-US'),
        businessName: bizName,
        ownerFirstName: person.first_name || '',
        ownerLastName: person.last_name || '',
        phone,
        city:
          person.city ||
          person.organization?.city ||
          '',
        website: person.organization?.website_url || '',
      };

      newLeads.push(lead);
      // Add to local set so we don't double-add within the same run
      existingNames.add(bizName.toLowerCase());

      console.log(
        `  ✓ ${bizName} — ${lead.ownerFirstName} ${lead.ownerLastName} (${lead.phone})`
      );
    }

    page++;
  }

  // ── Step 3: Report + write results ──────────────────────────────────────
  console.log(`\nSearch complete.`);
  console.log(`  Candidates reviewed : ${totalCandidates}`);
  console.log(`  Duplicates skipped  : ${skippedDuplicates}`);
  console.log(`  No phone, skipped   : ${skippedNoPhone}`);
  console.log(`  New leads found     : ${newLeads.length}\n`);

  if (newLeads.length === 0) {
    if (totalCandidates === 0) {
      const msg = 'Apollo returned zero results for the current search filters.';
      logError(msg);
      await sendErrorNotification(msg);
    } else {
      console.log('No new leads to add (all results were duplicates or lacked phone numbers).');
    }
    return;
  }

  try {
    await appendLeads(newLeads);
    console.log(`✅ Appended ${newLeads.length} new lead(s) to Google Sheet.`);
  } catch (err) {
    const msg = `Failed to write to Google Sheet: ${err.message}`;
    logError(msg, err);
    await sendErrorNotification(msg);
  }

  const elapsed = ((Date.now() - runStart.getTime()) / 1000).toFixed(1);
  console.log(`\nRun finished in ${elapsed}s.\n`);
}

module.exports = { runWorkflow };
