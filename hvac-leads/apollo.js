/**
 * Apollo.io REST API wrapper for HVAC lead search.
 * Requires Apollo Basic plan ($49/mo) or higher for the people search endpoint.
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// Southwest Michigan target locations — edit this array to expand/narrow the area
const TARGET_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
  // Surrounding county coverage
  'Berrien County, Michigan, United States',
  'Van Buren County, Michigan, United States',
  'Allegan County, Michigan, United States',
  'Ottawa County, Michigan, United States',
];

// Decision-maker titles in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industry keyword tags for Apollo's keyword filter
const INDUSTRY_TAGS = [
  'HVAC',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating',
  'cooling',
  'air conditioning',
  'furnace',
];

/**
 * Search Apollo for HVAC decision-makers in Southwest Michigan.
 * @param {number} maxFetch - How many candidates to request (fetch more than needed to allow for dedup).
 * @returns {Promise<Array>} Array of lead objects: { businessName, firstName, lastName, phone, city, website }
 */
async function searchHvacLeads(maxFetch = 75) {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set in your .env file.');
  }

  const payload = {
    api_key: process.env.APOLLO_API_KEY,
    person_titles: TARGET_TITLES,
    person_locations: TARGET_LOCATIONS,
    organization_num_employees_ranges: ['1,10', '11,25'], // owner-operated small businesses only
    q_organization_keyword_tags: INDUSTRY_TAGS,
    include_similar_titles: true, // also catches "proprietor", "managing partner", etc.
    per_page: Math.min(maxFetch, 100),
    page: 1,
  };

  let response;
  try {
    response = await axios.post(
      `${APOLLO_BASE}/mixed_people/api_search`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 30000,
      }
    );
  } catch (err) {
    if (err.response?.data?.error_code === 'API_INACCESSIBLE') {
      throw new Error(
        'Apollo API plan too low: the people search endpoint requires the Basic plan ($49/mo) or higher. ' +
        'Upgrade at https://www.apollo.io/pricing then re-run.'
      );
    }
    throw new Error(`Apollo request failed: ${err.message}`);
  }

  const data = response.data;
  if (data.error) {
    throw new Error(`Apollo API error: ${JSON.stringify(data.error)}`);
  }

  const people = data.people || [];
  if (people.length === 0) {
    console.log('[Apollo] Search returned 0 people. Try broadening location or industry filters.');
    return [];
  }

  // Map Apollo response fields to our lead shape
  return people
    .map((p) => {
      const phone =
        p.phone_numbers?.[0]?.raw_number ||
        p.phone_numbers?.[0]?.sanitized_number ||
        p.sanitized_phone ||
        '';

      const org = p.organization || {};
      return {
        businessName: org.name || p.employment_history?.[0]?.organization_name || '',
        firstName: p.first_name || '',
        // Apollo may mask last names on lower plans — use what's available
        lastName: p.last_name?.replace(/\*/g, '').trim() || '',
        phone,
        city: p.city || org.city || '',
        website: org.website_url || org.primary_domain || '',
      };
    })
    .filter((lead) => lead.businessName && lead.phone); // must have both business name and phone
}

module.exports = { searchHvacLeads, TARGET_LOCATIONS, TARGET_TITLES };
