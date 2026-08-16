'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { searchHVACLeads, enrichWithPhones, pickBestPhone } = require('./apollo');
const { getExistingBusinessNames, appendLeads } = require('./sheets');
const { log, sendErrorEmail } = require('./notify');

const MAX_LEADS = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

/**
 * Format a US phone number to (XXX) XXX-XXXX for readability.
 *
 * @param {string} raw - E.164 or raw number string
 * @returns {string}
 */
function formatPhone(raw = '') {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') {
    // Strip leading country code
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw; // return as-is if format is unexpected
}

/**
 * Derive the best available city from an Apollo person record.
 * Prefers the person's city, falls back to their employer's city.
 *
 * @param {object} person - Enriched Apollo person object
 * @returns {string}
 */
function resolveCity(person) {
  if (person.city) return person.city;
  if (person.organization?.city) return person.organization.city;
  if (person.present_raw_address) {
    // Extract city from raw address string as a last resort
    const parts = person.present_raw_address.split(',');
    return parts.length >= 2 ? parts[parts.length - 2].trim() : '';
  }
  return '';
}

/**
 * Derive the best available website URL from an Apollo person record.
 *
 * @param {object} person - Enriched Apollo person object
 * @returns {string}
 */
function resolveWebsite(person) {
  return (
    person.organization?.website_url ||
    person.organization?.primary_domain && `https://${person.organization.primary_domain}` ||
    person.website_url ||
    ''
  );
}

/**
 * Core lead generation workflow.
 *
 * 1. Load existing business names from Google Sheet (dedup guard)
 * 2. Search Apollo for HVAC/plumbing owners in SW Michigan
 * 3. Filter out businesses already in the sheet
 * 4. Enrich with phone numbers (batched, respects rate limits)
 * 5. Filter to contacts that have a phone number
 * 6. Append up to MAX_LEADS rows to Google Sheet
 *
 * @returns {Promise<{ added: number, searched: number, skippedDupes: number, skippedNoPhone: number }>}
 * @throws on critical errors (Apollo auth, Sheets write failure)
 */
async function runWorkflow() {
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  log('=== HVAC Lead Gen run started ===');
  log(`Date: ${today}  |  Max leads this run: ${MAX_LEADS}`);

  // ── Step 1: Load existing business names ──────────────────────────────────
  log('Reading existing business names from Google Sheet...');
  const existingNames = await getExistingBusinessNames();
  log(`Sheet already contains ${existingNames.size} business(es)`);

  // ── Step 2: Search Apollo ─────────────────────────────────────────────────
  log('Searching Apollo for HVAC contacts in SW Michigan...');
  const searchResult = await searchHVACLeads({ perPage: 100, page: 1 });
  const allPeople = searchResult.people || [];
  const pagination = searchResult.pagination || {};

  log(`Apollo returned ${allPeople.length} results (total available: ${pagination.total_entries ?? 'unknown'})`);

  if (!allPeople.length) {
    log('No results from Apollo search. Check filters and API key plan level.');
    return { added: 0, searched: 0, skippedDupes: 0, skippedNoPhone: 0 };
  }

  // ── Step 3: Filter out duplicate businesses ───────────────────────────────
  const newPeople = allPeople.filter(p => {
    const bizName = (p.organization_name || '').trim().toLowerCase();
    return bizName.length > 0 && !existingNames.has(bizName);
  });

  const skippedDupes = allPeople.length - newPeople.length;
  log(`${newPeople.length} new (${skippedDupes} already in sheet)`);

  if (!newPeople.length) {
    log('All returned businesses are already in the sheet. No new leads to add.');
    return { added: 0, searched: allPeople.length, skippedDupes, skippedNoPhone: 0 };
  }

  // ── Step 4: Enrich with phone numbers ─────────────────────────────────────
  // Pull extra candidates in case some come back with no phone.
  // We'll trim to MAX_LEADS after filtering.
  const toEnrich = newPeople.slice(0, Math.min(newPeople.length, MAX_LEADS * 3));
  const apolloIds = toEnrich.map(p => p.id).filter(Boolean);

  log(`Enriching ${apolloIds.length} contacts to reveal phone numbers...`);
  const enriched = await enrichWithPhones(apolloIds);
  log(`Enrichment complete — ${enriched.length} records returned`);

  // ── Step 5: Filter to contacts with phone numbers ─────────────────────────
  const withPhones = enriched.filter(p => {
    const phones = p.phone_numbers || [];
    return phones.length > 0;
  });

  const skippedNoPhone = enriched.length - withPhones.length;
  log(`${withPhones.length} have a phone number (${skippedNoPhone} skipped — no phone)`);

  if (!withPhones.length) {
    log('None of the enriched contacts have a phone number. Try broadening the search or checking your Apollo plan.');
    return { added: 0, searched: allPeople.length, skippedDupes, skippedNoPhone };
  }

  // ── Step 6: Format rows and cap at MAX_LEADS ──────────────────────────────
  const leads = withPhones.slice(0, MAX_LEADS).map(p => ({
    dateAdded:      today,
    businessName:   (p.organization_name || '').trim(),
    ownerFirstName: (p.first_name || '').trim(),
    ownerLastName:  (p.last_name || '').trim(),
    phoneNumber:    formatPhone(pickBestPhone(p.phone_numbers)),
    city:           resolveCity(p),
    website:        resolveWebsite(p),
  }));

  // ── Step 7: Append to Google Sheet ───────────────────────────────────────
  log(`Appending ${leads.length} lead(s) to Google Sheet...`);
  await appendLeads(leads);

  log(`✅ Done. Added ${leads.length} new lead(s).`);

  // Print a quick summary of what was added
  leads.forEach((l, i) => {
    log(`  ${i + 1}. ${l.businessName} | ${l.ownerFirstName} ${l.ownerLastName} | ${l.phoneNumber} | ${l.city}`);
  });

  log('=== Run complete ===');

  return {
    added: leads.length,
    searched: allPeople.length,
    skippedDupes,
    skippedNoPhone,
  };
}

module.exports = { runWorkflow };
