/**
 * Apollo.io API client
 * Searches for HVAC/plumbing business owners in SW Michigan and enriches
 * results with phone numbers.
 *
 * Apollo REST docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/v1';

// ─── Target config (easy to edit) ─────────────────────────────────────────────

// Cities to search — Apollo matches these against company headquarters.
// Add or remove cities here without touching anything else.
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Job titles in priority order.
// Apollo will also match semantically similar titles (controlled by include_similar_titles).
const TARGET_JOB_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'general manager',
];

// Industry keyword tags — Apollo uses these to classify companies.
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'heating & cooling',
  'plumbing',
  'mechanical contracting',
  'air conditioning',
];

// SIC code 1711: Plumbing, Heating, and Air-Conditioning Contractors.
// This is the most precise industry filter available.
const HVAC_SIC_CODES = ['1711'];

// Company size filter: 1–25 employees (owner-operated).
const EMPLOYEE_RANGE = '1,25';

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Search Apollo's people database for HVAC owners in SW Michigan.
 * Returns raw person objects (phone numbers may be partial).
 *
 * @param {number} perPage - how many candidates to fetch (fetch more than needed to account for filtering)
 * @returns {Promise<Object[]>}
 */
async function searchPeople(perPage = 75) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const res = await axios.post(
    `${BASE_URL}/mixed_people/search`,
    {
      api_key: apiKey,
      person_titles: TARGET_JOB_TITLES,
      // organization_locations matches the company's HQ city — what we want
      organization_locations: SW_MICHIGAN_CITIES,
      organization_num_employees_ranges: [EMPLOYEE_RANGE],
      organization_sic_codes: HVAC_SIC_CODES,
      q_organization_keyword_tags: INDUSTRY_KEYWORDS,
      include_similar_titles: true,
      per_page: Math.min(perPage, 100),
      page: 1,
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  return res.data?.people || [];
}

/**
 * Enrich a batch of Apollo person IDs to reveal full names and phone numbers.
 * Each batch costs Apollo credits — keep batches ≤10 to stay within rate limits.
 *
 * @param {string[]} ids - Apollo person IDs
 * @returns {Promise<Object[]>} enriched person objects
 */
async function enrichBatch(ids) {
  const apiKey = process.env.APOLLO_API_KEY;

  const res = await axios.post(
    `${BASE_URL}/people/bulk_match`,
    {
      api_key: apiKey,
      reveal_personal_emails: false,
      reveal_phone_number: true,
      details: ids.map(id => ({ id })),
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  return res.data?.matches || [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pull the best available phone number from an enriched person object.
 * Priority: mobile > direct line > any available number.
 *
 * @param {Object} person
 * @returns {string}
 */
function extractPhone(person) {
  const phones = person.phone_numbers || [];

  const mobile = phones.find(p => p.type === 'mobile');
  if (mobile?.sanitized_number) return mobile.sanitized_number;

  const direct = phones.find(p => p.type === 'direct');
  if (direct?.sanitized_number) return direct.sanitized_number;

  if (phones[0]?.sanitized_number) return phones[0].sanitized_number;

  return person.sanitized_phone || '';
}

/**
 * Match a raw city string to one of the target city names.
 * Falls back to the raw city value if no match found.
 *
 * @param {Object} person
 * @returns {string}
 */
function extractCity(person) {
  const raw = (person.city || person.organization?.city || '').trim();
  if (!raw) return '';

  const cityNames = SW_MICHIGAN_CITIES.map(c => c.split(',')[0].trim());
  const matched = cityNames.find(c => raw.toLowerCase().includes(c.toLowerCase()));
  return matched || raw;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Full lead search pipeline:
 *   1. Search Apollo for HVAC owners in SW Michigan
 *   2. Remove businesses already in the sheet
 *   3. Enrich for phone numbers (batched, rate-limited)
 *   4. Return up to `limit` leads that have a phone number
 *
 * @param {string[]} _targetCities - city names (used for display; search uses SW_MICHIGAN_CITIES)
 * @param {number} limit - max leads to return
 * @param {Set<string>} existingNames - lowercase business names already in the sheet
 * @returns {Promise<Object[]>}
 */
async function searchLeads(_targetCities, limit, existingNames) {
  console.log('Searching Apollo.io for HVAC leads in SW Michigan...');
  const rawPeople = await searchPeople(limit * 4); // over-fetch to account for dedup + no-phone filtering
  console.log(`  Apollo returned ${rawPeople.length} candidate(s)`);

  // Remove businesses we already have
  const newPeople = rawPeople.filter(p => {
    const name = (p.organization?.name || '').toLowerCase().trim();
    return name && !existingNames.has(name);
  });
  console.log(`  ${newPeople.length} new (not yet in sheet)`);

  if (newPeople.length === 0) return [];

  // Enrich for phone numbers in batches of 10
  console.log('  Enriching for phone numbers...');
  const toEnrich = newPeople.slice(0, limit * 2); // cap to avoid over-spending credits
  const enriched = [];
  const BATCH = 10;

  for (let i = 0; i < toEnrich.length; i += BATCH) {
    const batch = toEnrich.slice(i, i + BATCH);
    try {
      const results = await enrichBatch(batch.map(p => p.id));
      enriched.push(...results);
    } catch (err) {
      // If enrichment fails for a batch, fall back to the unenriched data
      console.warn(`  Enrichment batch at index ${i} failed (${err.message}) — using raw data for this batch`);
      enriched.push(...batch);
    }

    // 500ms between batches to respect Apollo rate limits
    if (i + BATCH < toEnrich.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Build final lead list
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

  const leads = enriched
    .filter(p => extractPhone(p)) // exclude contacts with no phone at all
    .slice(0, limit)
    .map(p => ({
      dateAdded:    today,
      businessName: p.organization?.name || '',
      firstName:    p.first_name || '',
      lastName:     p.last_name || '',
      phone:        extractPhone(p),
      city:         extractCity(p),
      website:      p.organization?.website_url || p.organization?.primary_domain || '',
      called:       '',
      notes:        '',
    }))
    .filter(lead => lead.businessName && lead.phone); // final sanity check

  return leads;
}

/**
 * Quick connectivity check — makes a minimal API call.
 * @returns {Promise<boolean>}
 */
async function testApolloConnection() {
  try {
    await searchPeople(1);
    return true;
  } catch (err) {
    console.error('Apollo connection test failed:', err.response?.data || err.message);
    return false;
  }
}

module.exports = { searchLeads, testApolloConnection };
