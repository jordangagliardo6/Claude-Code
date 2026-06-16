/**
 * apollo.js
 * Handles all Apollo.io REST API calls.
 *
 * Two operations:
 *   1. searchHVACPeople()  — finds owner-level contacts at small HVAC firms
 *   2. enrichPersonPhone() — fetches phone numbers for a specific person (costs 1 credit)
 *
 * To change the cities, edit TARGET_LOCATIONS.
 * To change the company size window, edit the employees range in searchHVACPeople().
 */

const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/v1';

// ─── Search targets ───────────────────────────────────────────────────────────

// Add or remove cities here to shift the search area.
const TARGET_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
  'Southwest Michigan, United States',
  'Berrien County, Michigan, United States',
  'Van Buren County, Michigan, United States',
  'Allegan County, Michigan, United States',
];

// NAICS 23822 = Plumbing, Heating & Air-Conditioning Contractors (primary)
// NAICS 23899 = Other Specialty Trade Contractors (catches mechanical)
const HVAC_NAICS_CODES = ['23822', '23899'];

// Keyword tags supplement NAICS for companies tagged differently in Apollo
const HVAC_KEYWORDS = [
  'HVAC',
  'heating and air conditioning',
  'air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating cooling',
];

// Titles in priority order — Apollo will also match similar titles (include_similar_titles: true)
const TARGET_TITLES = ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'];

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Search Apollo for owner-level contacts at small HVAC companies in SW Michigan.
 * Does NOT return phone numbers — call enrichPersonPhone() to get those.
 *
 * @param {number} page     - page number (1-based)
 * @param {number} perPage  - results per page (max 100)
 */
async function searchHVACPeople(page = 1, perPage = 50) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const response = await axios.post(
    `${BASE_URL}/mixed_people/search`,
    {
      api_key: apiKey,
      page,
      per_page: perPage,

      // Only owner-level decision makers
      person_titles: TARGET_TITLES,
      person_seniorities: ['owner', 'founder', 'c_suite'],
      include_similar_titles: true,

      // Southwest Michigan geography
      organization_locations: TARGET_LOCATIONS,

      // 1–25 employees = owner-operated small businesses
      organization_num_employees_ranges: ['1,10', '11,25'],

      // Industry filters
      organization_naics_codes: HVAC_NAICS_CODES,
      q_organization_keyword_tags: HVAC_KEYWORDS,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    }
  );

  return response.data;
}

/**
 * Enrich a single person to retrieve their phone number.
 *
 * ⚠️  CREDIT COST: 1 Apollo export credit per successfully matched person.
 *     At 25 leads/day this is ~750 credits/month.
 *
 * @param {object} person - a person object returned by searchHVACPeople()
 * @returns {object}      - enriched person object (may include phone_numbers array)
 */
async function enrichPersonPhone(person) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const response = await axios.post(
    `${BASE_URL}/people/match`,
    {
      api_key: apiKey,
      first_name: person.first_name,
      last_name: person.last_name,
      organization_name: person.organization?.name,
      domain: person.organization?.primary_domain,
      reveal_phone_number: true,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    }
  );

  return response.data?.person || {};
}

module.exports = { searchHVACPeople, enrichPersonPhone };
