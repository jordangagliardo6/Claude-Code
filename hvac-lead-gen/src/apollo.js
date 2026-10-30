'use strict';

/**
 * Apollo.io API client — searches for HVAC business owners in SW Michigan.
 *
 * Apollo v1 People Search docs:
 *   https://apolloio.github.io/apollo-api-docs/?shell#mixed-people-search
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// ─── Targeting config ────────────────────────────────────────────────────────

// Modify this list to add or remove cities.
const SW_MICHIGAN_CITIES = [
  'St. Joseph',
  'Saint Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

// HVAC and related industry keywords used in the Apollo keyword search.
// Modify here to target different industries.
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'heating and air conditioning',
  'heating air conditioning',
  'air conditioning contractor',
  'furnace',
  'plumbing',
  'mechanical contracting',
  'HVAC contractor',
];

// Titles to target, in priority order. Apollo matches on partial strings.
const TARGET_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'general manager',
];

// Employee range for owner-operated small businesses.
const EMPLOYEE_RANGE = '1,25';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the best available phone number from a person record.
 * Prefers mobile > direct > any available number.
 */
function extractPhone(person) {
  const numbers = person.phone_numbers || [];

  // Prefer mobile
  const mobile = numbers.find(n => n.type === 'mobile');
  if (mobile) return mobile.sanitized_number || mobile.raw_number;

  // Fall back to direct
  const direct = numbers.find(n => n.type === 'direct');
  if (direct) return direct.sanitized_number || direct.raw_number;

  // Fall back to first available
  if (numbers.length > 0) {
    return numbers[0].sanitized_number || numbers[0].raw_number;
  }

  // Some Apollo records surface a top-level field
  if (person.sanitized_phone) return person.sanitized_phone;

  return null;
}

/**
 * Normalize a person record into the flat shape leadGenerator expects.
 */
function normalizePerson(person) {
  const org = person.organization || {};
  const phone = extractPhone(person);

  return {
    businessName: org.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone,
    city: person.city || org.city || '',
    website: org.website_url || '',
    title: person.title || '',
  };
}

// ─── Main search ─────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC leads across all SW Michigan cities.
 *
 * @param {string} apiKey - APOLLO_API_KEY
 * @param {number} limit  - Maximum number of leads to return (across all cities)
 * @returns {Promise<Array>} Normalized lead objects
 */
async function searchLeads(apiKey, limit = 25) {
  const allLeads = [];
  const perCityLimit = Math.max(5, Math.ceil(limit / SW_MICHIGAN_CITIES.length));
  const keywordString = INDUSTRY_KEYWORDS.slice(0, 4).join(' OR ');

  for (const city of SW_MICHIGAN_CITIES) {
    if (allLeads.length >= limit) break;

    const payload = {
      api_key: apiKey,
      q_keywords: `(${keywordString}) ${city} Michigan`,
      person_titles: TARGET_TITLES,
      organization_locations: ['Michigan, United States'],
      organization_num_employees_ranges: [EMPLOYEE_RANGE],
      per_page: perCityLimit,
      page: 1,
    };

    try {
      const response = await axios.post(
        `${APOLLO_BASE}/mixed_people/search`,
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      );

      const people = response.data?.people || [];
      console.log(`  Apollo → ${city}: ${people.length} results`);

      for (const person of people) {
        if (allLeads.length >= limit) break;
        const lead = normalizePerson(person);
        // Drop contacts with no phone — per requirements
        if (!lead.phone) continue;
        // Drop contacts with no business name
        if (!lead.businessName) continue;
        allLeads.push(lead);
      }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      // 422 = no results for this query, not a fatal error
      if (status === 422) {
        console.log(`  Apollo → ${city}: no results`);
      } else {
        throw new Error(`Apollo search failed for "${city}" (HTTP ${status || 'N/A'}): ${msg}`);
      }
    }

    // Small pause between city searches to be polite to the API
    await new Promise(r => setTimeout(r, 500));
  }

  return allLeads;
}

module.exports = { searchLeads, SW_MICHIGAN_CITIES, TARGET_TITLES };
