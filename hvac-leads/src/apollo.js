/**
 * Apollo.io REST API client.
 *
 * Two-step approach:
 *  1. searchHvacLeads()        — finds people matching HVAC / SW Michigan filters
 *  2. enrichContacts()         — bulk-matches those people to reveal phone numbers
 *
 * Phone enrichment consumes Apollo export credits. The workflow only enriches
 * the results it intends to add (after dedup) to keep credit usage minimal.
 */

const axios = require('axios');
const config = require('./config');

const client = axios.create({
  baseURL: config.apolloBaseUrl,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': config.apolloApiKey,
  },
  timeout: 30_000,
});

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC decision-makers in Southwest Michigan.
 * Returns raw people objects — no phone numbers at this stage.
 *
 * @param {number} page    - 1-based page number
 * @param {number} perPage - results per page (max 100)
 */
async function searchHvacLeads(page = 1, perPage = 25) {
  // Build per-city location strings so Apollo biases toward SW Michigan.
  const cityLocations = config.targetCities.map(c => `${c}, Michigan, United States`);

  const payload = {
    page,
    per_page: perPage,

    // Job title filter — strict match (include_similar_titles: false).
    person_titles: config.personTitles,
    include_similar_titles: false,

    // Location: person's own location AND company HQ location.
    person_locations: ['Michigan, United States', ...cityLocations],
    organization_locations: ['Michigan, United States', ...cityLocations],

    // Industry signals.
    q_organization_keyword_tags: config.industryKeywords,
    organization_naics_codes: config.naicsCodes,

    // Small business filter: 1–25 employees.
    organization_num_employees_ranges: [config.employeeRange],

    // Seniority guard — skip mid-level employees.
    person_seniorities: ['owner', 'founder', 'c_suite'],
  };

  const { data } = await client.post('/mixed_people/search', payload);
  return data; // { people: [...], pagination: { total_entries, ... } }
}

// ── Enrichment ────────────────────────────────────────────────────────────────

/**
 * Enrich an array of people objects with phone numbers.
 * Sends batches of 10 to respect Apollo's bulk_match limits.
 *
 * Credit note: each successfully matched person consumes 1 export credit.
 *
 * @param {Array} people - raw people from searchHvacLeads()
 * @returns {Array} enriched people with phone_numbers[]
 */
async function enrichContacts(people) {
  if (!people || people.length === 0) return [];

  const BATCH = 10;
  const results = [];

  for (let i = 0; i < people.length; i += BATCH) {
    const batch = people.slice(i, i + BATCH);

    const payload = {
      reveal_personal_emails: false,
      reveal_phone_number: true,
      details: batch.map(p => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        organization_name: p.organization_name || p.account?.name || '',
        email: p.email || '',
      })),
    };

    const { data } = await client.post('/people/bulk_match', payload);
    if (data?.matches) results.push(...data.matches);

    // Small pause between batches — be respectful of rate limits.
    if (i + BATCH < people.length) {
      await sleep(1000);
    }
  }

  return results;
}

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Pick the best phone number from an enriched person.
 * Priority: mobile → direct_phone → work → work_hq → anything.
 */
function getBestPhone(person) {
  const phones = person.phone_numbers || [];
  const order = ['mobile', 'direct_phone', 'work', 'work_hq'];

  for (const type of order) {
    const match = phones.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }

  return phones[0]?.sanitized_number || phones[0]?.raw_number || null;
}

function extractCity(person) {
  if (person.city) return person.city;
  if (person.location) return person.location.split(',')[0]?.trim() || '';
  return '';
}

/**
 * Full pipeline: search → enrich → filter → format.
 * Returns rows ready to write to Google Sheets.
 *
 * @param {number} maxLeads - cap on how many leads to return
 */
async function getEnrichedLeads(maxLeads = 25) {
  console.log(`[Apollo] Searching for HVAC leads in SW Michigan (max ${maxLeads})…`);

  const searchData = await searchHvacLeads(1, maxLeads);
  const people = searchData.people || [];
  const total = searchData.pagination?.total_entries ?? people.length;

  console.log(`[Apollo] Search returned ${people.length} people (${total} total available)`);

  if (people.length === 0) return [];

  console.log(`[Apollo] Enriching ${people.length} contacts for phone numbers…`);
  const enriched = await enrichContacts(people);

  // Keep only contacts that have at least one phone number.
  const withPhone = enriched.filter(p => (p.phone_numbers || []).length > 0);
  console.log(`[Apollo] ${withPhone.length}/${enriched.length} contacts have phone numbers`);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD

  return withPhone.map(p => ({
    dateAdded:    today,
    businessName: p.organization_name || p.account?.name || '',
    firstName:    p.first_name || '',
    // Apollo may mask last names with "***" until enrichment; strip them if still masked.
    lastName:     (p.last_name || '').replace(/\*/g, '').trim(),
    phone:        getBestPhone(p) || '',
    city:         extractCity(p),
    website:      p.organization_website_url || p.account?.website_url || '',
  }));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchHvacLeads, enrichContacts, getEnrichedLeads, getBestPhone };
