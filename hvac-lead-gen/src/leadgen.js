/**
 * leadgen.js — Core workflow logic
 *
 * Orchestrates the full lead generation run:
 *   1. Ensure spreadsheet headers exist
 *   2. Load existing business names (duplicate prevention)
 *   3. Search Apollo.io for HVAC leads
 *   4. Filter: must have a phone number, must not be a duplicate
 *   5. Append new leads to Google Sheets
 *
 * Controlled by env vars:
 *   MAX_LEADS_PER_RUN  — cap on new leads per execution (default 25)
 */

const {
  searchHvacLeads,
  extractPhoneNumber,
  extractCity,
  extractWebsite,
} = require('./apollo');

const {
  getExistingBusinessNames,
  ensureHeaders,
  appendLeads,
} = require('./sheets');

const { sendErrorNotification } = require('./notify');

const MAX_LEADS_PER_RUN = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

/**
 * Normalize a business name for case-insensitive duplicate comparison.
 * @param {string} name
 * @returns {string}
 */
function normalizeName(name) {
  return (name || '').toLowerCase().trim();
}

/**
 * Extract organization name from a person record.
 * Apollo may surface it at the top-level or nested under .organization.
 * @param {object} person
 * @returns {string}
 */
function extractBusinessName(person) {
  return (
    person.organization_name ||
    (person.organization && person.organization.name) ||
    ''
  );
}

/**
 * Run the full lead generation workflow.
 *
 * @returns {Promise<{added: number, skipped: number, total: number}>}
 */
async function runLeadGeneration() {
  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
  });
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`[LeadGen] Run started at ${timestamp} ET`);
  console.log(`[LeadGen] Max leads this run: ${MAX_LEADS_PER_RUN}`);
  console.log(`${'─'.repeat(50)}`);

  // ── Step 1: Ensure header row ──────────────────────────
  try {
    await ensureHeaders();
  } catch (err) {
    const msg = `Could not access Google Sheets to check headers.\n${err.message}`;
    await sendErrorNotification('Google Sheets Connection Error', msg);
    throw err;
  }

  // ── Step 2: Load existing business names ───────────────
  let existingNames;
  try {
    existingNames = await getExistingBusinessNames();
    console.log(`[LeadGen] ${existingNames.size} existing businesses in sheet (checked for duplicates).`);
  } catch (err) {
    const msg = `Failed to read existing leads from Google Sheets.\n${err.message}`;
    await sendErrorNotification('Google Sheets Read Error', msg);
    throw err;
  }

  // ── Step 3: Search Apollo ──────────────────────────────
  let apolloData;
  try {
    console.log('[LeadGen] Querying Apollo.io for HVAC leads in SW Michigan...');
    // Fetch up to 100 results so filtering still yields 25 new leads
    apolloData = await searchHvacLeads(1, 100);
  } catch (err) {
    const detail = err.response?.data
      ? JSON.stringify(err.response.data, null, 2)
      : err.message;
    await sendErrorNotification(
      'Apollo.io API Error',
      `Search request failed.\n\n${detail}`
    );
    throw err;
  }

  const people = apolloData.people || [];
  const totalFound = apolloData.pagination?.total_entries || people.length;
  console.log(
    `[LeadGen] Apollo returned ${people.length} people (${totalFound} total matches in DB).`
  );

  if (people.length === 0) {
    await sendErrorNotification(
      'Apollo Returned Zero Results',
      'The Apollo search returned 0 contacts for HVAC companies in SW Michigan.\n' +
        'Possible causes:\n' +
        '  • Invalid or expired APOLLO_API_KEY\n' +
        '  • Apollo rate limit reached\n' +
        '  • Industry/location filters returned no matches\n\n' +
        'Check your Apollo dashboard and run `npm run test-setup` to diagnose.'
    );
    return { added: 0, skipped: 0, total: 0 };
  }

  // ── Step 4: Filter & map leads ─────────────────────────
  const newLeads = [];
  let skippedDuplicate = 0;
  let skippedNoPhone = 0;
  let skippedNoName = 0;

  for (const person of people) {
    if (newLeads.length >= MAX_LEADS_PER_RUN) break;

    const businessName = extractBusinessName(person);

    if (!businessName) {
      skippedNoName++;
      continue;
    }

    // Duplicate check (case-insensitive)
    if (existingNames.has(normalizeName(businessName))) {
      console.log(`[LeadGen]  ↩ Duplicate skipped: ${businessName}`);
      skippedDuplicate++;
      continue;
    }

    // Phone number is required — skip if unavailable
    const phone = extractPhoneNumber(person);
    if (!phone) {
      console.log(
        `[LeadGen]  ✗ No phone — skipping: ${businessName} (${person.name || person.first_name})`
      );
      skippedNoPhone++;
      continue;
    }

    // Build lead record
    newLeads.push({
      businessName,
      firstName: person.first_name || '',
      lastName: person.last_name || '',   // may be masked on some plans
      phone,
      city: extractCity(person),
      website: extractWebsite(person),
    });

    console.log(`[LeadGen]  ✓ Queued: ${businessName} (${person.first_name} ${person.last_name || '?'}) — ${phone}`);
  }

  console.log(
    `[LeadGen] Filtered results → ${newLeads.length} new | ` +
    `${skippedDuplicate} duplicates | ${skippedNoPhone} no-phone | ` +
    `${skippedNoName} no-name`
  );

  // ── Step 5: Write to spreadsheet ──────────────────────
  let added = 0;

  if (newLeads.length === 0) {
    console.log('[LeadGen] No new leads to add this run.');
  } else {
    try {
      added = await appendLeads(newLeads);
      console.log(`[LeadGen] ✅ ${added} new leads written to Google Sheets.`);
    } catch (err) {
      const leadDump = newLeads
        .map(l => `  ${l.businessName} | ${l.firstName} ${l.lastName} | ${l.phone} | ${l.city}`)
        .join('\n');

      await sendErrorNotification(
        'Google Sheets Write Failed',
        `Could not write ${newLeads.length} leads to the spreadsheet.\n\n` +
          `Error: ${err.message}\n\nLeads that were NOT saved:\n${leadDump}`
      );
      throw err;
    }
  }

  console.log(`[LeadGen] Run complete. Added: ${added}, Skipped: ${skippedDuplicate + skippedNoPhone}.`);
  return {
    added,
    skipped: skippedDuplicate + skippedNoPhone + skippedNoName,
    total: people.length,
  };
}

module.exports = { runLeadGeneration };
