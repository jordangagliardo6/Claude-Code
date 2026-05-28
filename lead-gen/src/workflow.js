/**
 * src/workflow.js — Core lead generation logic.
 *
 * Flow:
 *  1. Pull existing business names from Google Sheet (duplicate check)
 *  2. Search Apollo for owner-level HVAC contacts in SW Michigan
 *  3. Dedupe against existing names + within this batch
 *  4. Enrich each new contact (costs 1 Apollo credit each) to get phone numbers
 *  5. Skip contacts with no phone number
 *  6. Append up to MAX_LEADS_PER_RUN new rows to the sheet
 *  7. On any failure, send an alert and re-throw so the scheduler logs it
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const config = require('../config');
const { searchHVACContacts, enrichContact } = require('./apollo');
const { getExistingBusinessNames, appendLeads } = require('./sheets');
const { sendAlert } = require('./notify');

/**
 * Main workflow. Call this directly or via the scheduler.
 */
async function runWorkflow() {
  const startedAt = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`HVAC Lead Gen run started at ${startedAt}`);
  console.log('='.repeat(60));

  try {
    // ── Step 1: Load existing names for duplicate detection ────────────────
    console.log('\n1. Loading existing business names from Google Sheet…');
    const existingNames = await getExistingBusinessNames();
    console.log(`   Found ${existingNames.size} existing entries.`);

    // ── Step 2: Search Apollo ──────────────────────────────────────────────
    // Fetch more than we need so we still hit MAX_LEADS after deduping.
    const fetchBatch = config.MAX_LEADS_PER_RUN * 3;
    console.log(`\n2. Searching Apollo for up to ${fetchBatch} HVAC contacts…`);
    const candidates = await searchHVACContacts(fetchBatch);
    console.log(`   Apollo returned ${candidates.length} candidates.`);

    if (candidates.length === 0) {
      await sendAlert(
        'Apollo returned 0 results',
        `Run at ${startedAt}\n\nApollo search returned no candidates for SW Michigan HVAC leads.\n` +
          'This may mean:\n' +
          '  • Apollo API key is invalid or rate-limited\n' +
          '  • Filters are too narrow\n' +
          '  • Temporary Apollo service issue\n\n' +
          'Check APOLLO_API_KEY and try running manually: npm run run-now'
      );
      return { added: 0, skipped: 0 };
    }

    // ── Step 3: Dedupe (existing sheet + within this batch) ────────────────
    console.log('\n3. Deduplicating…');
    const seenThisRun = new Set();
    const newCandidates = candidates.filter((p) => {
      const name = (p.organization?.name || p.employment_history?.[0]?.organization_name || '').trim();
      if (!name) return false;
      const key = name.toLowerCase();
      if (existingNames.has(key) || seenThisRun.has(key)) return false;
      seenThisRun.add(key);
      return true;
    });
    console.log(`   ${newCandidates.length} new candidates after dedup.`);

    // ── Step 4: Enrich + filter by phone ──────────────────────────────────
    console.log('\n4. Enriching contacts to retrieve phone numbers…');
    console.log('   (Each enrichment costs 1 Apollo credit — skipping if no phone found)\n');

    const newRows = [];
    const today = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    for (const person of newCandidates) {
      if (newRows.length >= config.MAX_LEADS_PER_RUN) break;

      const companyName =
        person.organization?.name ||
        person.employment_history?.[0]?.organization_name ||
        'Unknown';

      process.stdout.write(`   Enriching: ${companyName} (${person.first_name} ${person.last_name})… `);

      const enriched = await enrichContact(person.id, companyName);
      if (!enriched) {
        console.log('no phone — skipped.');
        continue;
      }

      console.log(`✓ phone: ${enriched._resolvedPhone}`);

      // Resolve city: prefer person location, fall back to organization
      const city =
        enriched.city ||
        enriched.present_city ||
        enriched.organization?.city ||
        '';

      // Build row matching config.SHEET_HEADERS order exactly:
      // Date Added, Business Name, Owner First Name, Owner Last Name,
      // Phone Number, City, Website, Called, Notes
      newRows.push([
        today,
        companyName,
        enriched.first_name || '',
        enriched.last_name || '',
        enriched._resolvedPhone,
        city,
        enriched.organization?.website_url || enriched.organization?.primary_domain || '',
        '', // Called — left blank
        '', // Notes — left blank
      ]);
    }

    // ── Step 5: Write to Google Sheet ─────────────────────────────────────
    if (newRows.length === 0) {
      console.log('\n5. No new leads with phone numbers to append.');
      return { added: 0, skipped: candidates.length - newRows.length };
    }

    console.log(`\n5. Appending ${newRows.length} new leads to Google Sheet…`);
    const appended = await appendLeads(newRows);
    console.log(`   ✓ ${appended} rows added.`);

    const summary =
      `Run complete at ${new Date().toISOString()}\n` +
      `  Added: ${appended} leads\n` +
      `  Apollo candidates: ${candidates.length}\n` +
      `  Skipped (dup or no phone): ${candidates.length - appended}`;
    console.log(`\n${summary}`);

    return { added: appended, skipped: candidates.length - appended };
  } catch (err) {
    const message =
      `Error during HVAC lead gen run at ${startedAt}\n\n` +
      `Message: ${err.message}\n\n` +
      `Stack:\n${err.stack}`;

    await sendAlert('Workflow failed — manual check required', message);
    throw err;
  }
}

module.exports = { runWorkflow };
