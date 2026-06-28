/**
 * apollo.js — Apollo.io REST API client
 *
 * Uses the /v1/mixed_people/search endpoint to find HVAC company owners
 * in Southwest Michigan. Phone numbers are extracted from whatever the
 * API returns on your plan (direct/mobile preferred, fallback to any).
 *
 * To change cities: edit SW_MICHIGAN_CITIES below.
 * To change industries: edit INDUSTRY_TAGS below.
 * To change job titles: edit TARGET_TITLES below.
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// Cities included in the SW Michigan search.
// These are passed as person_locations so both the contact
// AND the company are biased toward these areas.
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// City name fragments used for post-filter duplicate normalization
const SW_MICHIGAN_CITY_NAMES = [
  'st. joseph', 'st joseph', 'benton harbor', 'kalamazoo',
  'holland', 'grand haven', 'muskegon', 'south haven',
];

// Job titles in priority order (Owner first, GM last)
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industry keyword tags sent to Apollo
const INDUSTRY_TAGS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
];

/**
 * Search Apollo for HVAC leads matching all configured filters.
 *
 * @param {number} page     - Page number (1-based)
 * @param {number} perPage  - Results per page (max 100)
 * @returns {Promise<object>} Raw Apollo API response
 */
async function searchHvacLeads(page = 1, perPage = 100) {
  const response = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    {
      // Title filter — broadened via include_similar_titles: false for strict matching
      person_titles: TARGET_TITLES,
      include_similar_titles: false,

      // Company size: 1–25 employees (owner-operated small businesses)
      organization_num_employees_ranges: ['1,10', '11,25'],

      // Location: Michigan state for company HQ
      organization_locations: ['Michigan, United States'],

      // Industry keyword tags
      q_organization_keyword_tags: INDUSTRY_TAGS,

      // Person seniority signals
      person_seniorities: ['owner', 'founder', 'c_suite'],

      // Pagination
      per_page: perPage,
      page,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.APOLLO_API_KEY,
        'Cache-Control': 'no-cache',
      },
      timeout: 30000,
    }
  );

  return response.data;
}

/**
 * Extract the best available phone number from a person record.
 * Priority: direct → mobile → corporate → work → other → sanitized_phone field.
 * Returns null if no number is available (caller must skip this contact).
 *
 * @param {object} person - Apollo person object
 * @returns {string|null}
 */
function extractPhoneNumber(person) {
  const phones = person.phone_numbers || [];
  const priority = ['direct', 'mobile', 'corporate', 'work', 'other'];

  for (const type of priority) {
    const match = phones.find(
      p => p.type === type && (p.sanitized_number || p.raw_number)
    );
    if (match) return match.sanitized_number || match.raw_number;
  }

  // Fallback: any non-empty number regardless of type
  const any = phones.find(p => p.sanitized_number || p.raw_number);
  if (any) return any.sanitized_number || any.raw_number;

  // Some plans surface a top-level sanitized_phone field
  if (person.sanitized_phone) return person.sanitized_phone;

  return null;
}

/**
 * Extract city from person record (falls back to organization city).
 *
 * @param {object} person - Apollo person object
 * @returns {string}
 */
function extractCity(person) {
  if (person.city) return person.city;
  if (person.organization && person.organization.city) {
    return person.organization.city;
  }
  return '';
}

/**
 * Extract the company website URL from a person record.
 *
 * @param {object} person - Apollo person object
 * @returns {string}
 */
function extractWebsite(person) {
  const org = person.organization || {};

  if (org.website_url) return org.website_url;

  if (org.primary_domain) {
    const domain = org.primary_domain;
    return domain.startsWith('http') ? domain : `https://${domain}`;
  }

  return '';
}

/**
 * Return true if the person's city is one of the SW Michigan targets.
 * Used as a soft post-filter (Apollo's location filter is already applied).
 *
 * @param {object} person - Apollo person object
 * @returns {boolean}
 */
function isInSwMichigan(person) {
  const city = extractCity(person).toLowerCase();
  return SW_MICHIGAN_CITY_NAMES.some(c => city.includes(c));
}

module.exports = {
  searchHvacLeads,
  extractPhoneNumber,
  extractCity,
  extractWebsite,
  isInSwMichigan,
  SW_MICHIGAN_CITIES,
  TARGET_TITLES,
  INDUSTRY_TAGS,
};
