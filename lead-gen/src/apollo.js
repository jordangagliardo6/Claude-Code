'use strict';

/**
 * Apollo.io API integration
 *
 * Apollo REST API docs: https://apolloio.github.io/apollo-api-docs/
 * Requires a paid plan (Basic $49/mo or higher) for People Search + Enrichment.
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// Southwest Michigan cities — add or remove as needed
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Job titles to target, in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industries / keyword tags to match against
const INDUSTRY_TAGS = [
  'hvac',
  'heating and air conditioning',
  'heating and cooling',
  'plumbing',
  'mechanical contracting',
  'air conditioning',
];

// NAICS code for Plumbing, Heating, and Air-Conditioning Contractors
const HVAC_NAICS = ['238220'];

/**
 * Search Apollo for HVAC company owners in Southwest Michigan.
 *
 * @param {number} maxLeads  Cap on results (default from env)
 * @returns {Promise<Array>} Array of raw Apollo person objects
 */
async function searchHvacLeads(maxLeads = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment');

  // Apollo People Search — POST /v1/mixed_people/search
  // Requires Basic plan or higher
  const payload = {
    api_key: apiKey,
    person_titles: TARGET_TITLES,
    include_similar_titles: true,
    organization_num_employees_ranges: ['1,25'],

    // Try SW Michigan cities first; falls back to all of Michigan
    person_locations: SW_MICHIGAN_CITIES,
    organization_locations: ['Michigan, United States'],

    q_organization_keyword_tags: INDUSTRY_TAGS,
    organization_naics_codes: HVAC_NAICS,

    per_page: Math.min(maxLeads, 25), // Apollo max per page is 100; keep it tight
    page: 1,
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    });
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    throw new Error(`Apollo People Search failed: ${msg}`);
  }

  const people = response.data?.people || [];
  console.log(`[Apollo] People Search returned ${people.length} candidate(s)`);
  return people;
}

/**
 * Enrich an array of Apollo person objects to get phone numbers.
 * Uses Bulk People Match, which consumes enrichment credits.
 *
 * @param {Array} people  Raw person objects from searchHvacLeads()
 * @returns {Promise<Array>} Enriched people — only those with at least one phone number
 */
async function enrichWithPhoneNumbers(people) {
  if (!people.length) return [];

  const apiKey = process.env.APOLLO_API_KEY;

  // Build match details — Apollo can match on id or LinkedIn URL
  const details = people.map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    organization_name: p.organization?.name,
  }));

  let response;
  try {
    response = await axios.post(
      `${APOLLO_BASE}/people/bulk_match`,
      {
        api_key: apiKey,
        details,
        reveal_phone_number: true,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60_000,
      }
    );
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    throw new Error(`Apollo Bulk Enrich failed: ${msg}`);
  }

  const enriched = response.data?.matches || [];
  console.log(`[Apollo] Enrichment returned ${enriched.length} match(es)`);

  // Keep only contacts that have at least one phone number
  const withPhone = enriched.filter((p) => {
    const phones = p.phone_numbers || [];
    return phones.length > 0;
  });

  console.log(`[Apollo] ${withPhone.length} contact(s) have a phone number`);
  return withPhone;
}

/**
 * Pull the best phone number for a person (prefers mobile > direct > any).
 *
 * @param {Object} person  Enriched Apollo person object
 * @returns {string}       Formatted phone number or empty string
 */
function pickBestPhone(person) {
  const phones = person.phone_numbers || [];
  if (!phones.length) return '';

  const priority = ['mobile', 'direct_phone', 'work', 'other'];
  for (const type of priority) {
    const match = phones.find((p) => p.type === type);
    if (match?.sanitized_number) return match.sanitized_number;
  }

  // Fall back to the first available number
  return phones[0]?.sanitized_number || phones[0]?.raw_number || '';
}

/**
 * Convert a raw enriched Apollo person into a clean lead object.
 *
 * @param {Object} person  Enriched Apollo person object
 * @returns {Object}       Flat lead record ready for Google Sheets
 */
function normalizeLead(person) {
  const org = person.organization || person.employment_history?.[0] || {};

  return {
    firstName: person.first_name || '',
    lastName: (person.last_name || '').replace(/\[.*\]$/, '').trim(), // strip Apollo mask markers
    businessName: org.name || person.company || '',
    phone: pickBestPhone(person),
    city: person.city || org.city || '',
    website: org.website_url || org.domain || '',
  };
}

module.exports = {
  searchHvacLeads,
  enrichWithPhoneNumbers,
  normalizeLead,
  SW_MICHIGAN_CITIES,
};
