/**
 * apollo.js — Apollo.io API integration
 *
 * Searches for HVAC company owners/decision-makers in Southwest Michigan.
 * Uses the Apollo People Search REST API (no per-search credit cost).
 *
 * Phone numbers: Apollo's people search returns phone data for contacts
 * already in your account or where Apollo has verified numbers. If you're
 * finding leads with blank phones, you may need to run Apollo Enrichment
 * (costs 1 credit/contact) — see docs at https://apolloio.github.io/apollo-api-docs/
 */

'use strict';

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// ─── Edit these to change your target geography ───────────────────────────────
const TARGET_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// ─── Edit these to change the industries you're targeting ────────────────────
const TARGET_INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating',
  'cooling',
  'air conditioning',
];

// ─── Edit these to change which job titles to target ─────────────────────────
// Apollo tries these in order; the first match wins for a given contact.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

/**
 * Build and send a people-search request to Apollo.
 * @param {number} perPage  - results per page (max 100)
 * @param {number} page     - page number (1-indexed)
 */
async function searchPeople(perPage = 50, page = 1) {
  const resp = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    {
      person_titles: TARGET_TITLES,
      organization_locations: TARGET_CITIES,
      organization_num_employees_ranges: ['1,25'],
      q_organization_keyword_tags: TARGET_INDUSTRY_KEYWORDS,
      // Include similar title variations (false = strict match)
      include_similar_titles: true,
      per_page: perPage,
      page,
    },
    {
      headers: {
        'X-Api-Key': process.env.APOLLO_API_KEY,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 20000,
    }
  );

  return resp.data;
}

/**
 * Extract the best available phone number from a raw Apollo person object.
 *
 * Priority order:
 *   1. Mobile number (personal, most likely to reach owner directly)
 *   2. Direct number
 *   3. Work/corporate number
 *   4. Any number in the phone_numbers array
 *   5. The contact's top-level sanitized_phone field
 *   6. The company's primary_phone (for small businesses the company phone
 *      IS typically the owner's phone)
 */
function extractPhone(person) {
  const phones = person.phone_numbers || [];

  for (const preferredType of ['mobile', 'direct', 'work', 'other']) {
    const match = phones.find(
      (p) => p.type === preferredType && (p.sanitized_number || p.number)
    );
    if (match) return match.sanitized_number || match.number;
  }

  // Catch-all: first entry with any number
  if (phones.length > 0) {
    const first = phones[0];
    if (first.sanitized_number || first.number)
      return first.sanitized_number || first.number;
  }

  // Top-level field (older Apollo response shapes)
  if (person.sanitized_phone) return person.sanitized_phone;

  // Company main line as last resort
  const companyPhone = person.organization?.primary_phone;
  if (companyPhone?.number) return companyPhone.number;

  return null;
}

/**
 * Map a raw Apollo person object to our internal lead shape.
 */
function formatLead(person) {
  return {
    businessName: (person.organization_name || '').trim(),
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone: extractPhone(person),
    city:
      person.organization?.city ||
      person.city ||
      '',
    website: person.organization?.website_url || '',
    title: person.title || '',
  };
}

/**
 * Fetch up to `maxLeads` qualified leads from Apollo.
 *
 * Applies client-side filtering:
 *   - Must have a business name
 *   - Must have a phone number (either from Apollo or company record)
 *
 * @param {number} maxLeads - cap on how many leads to return (default: 25)
 * @returns {Promise<Array>} array of lead objects
 */
async function fetchLeads(maxLeads = 25) {
  const qualified = [];
  let page = 1;

  // Pull up to 3 pages of results to find enough leads with phone numbers
  while (qualified.length < maxLeads && page <= 3) {
    const data = await searchPeople(50, page);
    const people = data.people || [];

    if (people.length === 0) break;

    const batch = people
      .map(formatLead)
      .filter((lead) => lead.businessName && lead.phone);

    qualified.push(...batch);

    // If Apollo returned fewer results than requested, there are no more pages
    if (people.length < 50) break;
    page++;
  }

  return qualified.slice(0, maxLeads);
}

/**
 * Quick connectivity test — returns true if the API key is valid.
 */
async function testConnection() {
  const data = await searchPeople(1, 1);
  return Array.isArray(data.people);
}

module.exports = {
  fetchLeads,
  testConnection,
  TARGET_CITIES,
  TARGET_TITLES,
  TARGET_INDUSTRY_KEYWORDS,
};
