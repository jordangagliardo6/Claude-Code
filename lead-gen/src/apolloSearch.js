/**
 * apolloSearch.js
 *
 * Queries the Apollo.io People Search API for HVAC decision-makers
 * in Southwest Michigan. Edit the arrays below to change targeting.
 */

const axios = require('axios');

// --- Edit these to change geographic targeting ---
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
  'Southwest Michigan, United States',
];

// --- Edit these to change industry targeting ---
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
];

// --- Edit these to change job title targeting (priority order) ---
const TARGET_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'general manager',
];

/**
 * Searches Apollo.io for HVAC leads matching the criteria above.
 * @param {number} limit  Max contacts to request (Apollo caps at 100 per page).
 * @returns {Array}       Array of Apollo contact objects.
 */
async function searchHVACLeads(limit = 50) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY not set in .env');

  const response = await axios.post(
    'https://api.apollo.io/v1/mixed_people/search',
    {
      api_key: apiKey,
      person_titles: TARGET_TITLES,
      organization_locations: SW_MICHIGAN_LOCATIONS,
      q_organization_keyword_tags: INDUSTRY_KEYWORDS,
      // 1–25 employees targets owner-operated shops
      organization_num_employees_ranges: ['1,25'],
      per_page: Math.min(limit, 100),
      page: 1,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    }
  );

  const contacts = response.data?.people || [];

  // Keep only contacts that have at least one phone number on file
  return contacts.filter(
    (c) => Array.isArray(c.phone_numbers) && c.phone_numbers.length > 0
  );
}

module.exports = { searchHVACLeads };
