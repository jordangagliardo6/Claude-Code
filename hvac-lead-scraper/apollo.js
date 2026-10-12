/**
 * Apollo.io API integration for HVAC lead prospecting.
 *
 * Uses the People Search endpoint to find owners/decision-makers
 * at HVAC and related companies in Southwest Michigan.
 *
 * Requires a paid Apollo plan (Basic ~$49/mo or higher) for People Search.
 * Free plan only allows enrichment of contacts you've already saved.
 */

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// Target cities and their surrounding SW Michigan zip codes
// Extend this list to cast a wider net or narrow it to specific areas
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
  // Surrounding towns that consistently produce leads
  'Stevensville, Michigan',
  'Paw Paw, Michigan',
  'Watervliet, Michigan',
  'Coloma, Michigan',
  'Three Rivers, Michigan',
  'Mattawan, Michigan',
  'Portage, Michigan',
];

// Industries to target — Apollo keyword tags matching HVAC/plumbing/mechanical
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'heating and cooling',
  'air conditioning',
  'plumbing',
  'mechanical contracting',
  'refrigeration',
];

// Job titles in priority order (Owner is top priority)
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

/**
 * Search Apollo for HVAC decision-makers in SW Michigan.
 *
 * @param {number} maxResults - Max contacts to return (capped at 25 per run)
 * @param {number} page - Page number for pagination
 * @returns {Promise<Array>} Array of lead objects
 */
async function searchHVACLeads(maxResults = 25, page = 1) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment');

  const payload = {
    api_key: apiKey,
    person_titles: TARGET_TITLES,
    include_similar_titles: false,
    person_locations: ['Michigan, United States'],
    organization_num_employees_ranges: ['1,10', '11,25'],
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    page,
    per_page: Math.min(maxResults, 25),
  };

  try {
    const response = await axios.post(
      `${APOLLO_BASE_URL}/mixed_people/search`,
      payload,
      {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        timeout: 30000,
      }
    );

    const people = response.data?.people || [];
    console.log(`Apollo returned ${people.length} raw results (page ${page})`);
    return people.map(mapApolloPersonToLead).filter(isValidLead);
  } catch (err) {
    if (err.response?.status === 422) {
      const msg = err.response.data?.message || 'Apollo plan limit reached';
      throw new Error(`APOLLO_PLAN_LIMIT: ${msg}`);
    }
    if (err.response?.status === 401) {
      throw new Error('APOLLO_AUTH_ERROR: Invalid or missing API key');
    }
    throw new Error(`Apollo API error: ${err.message}`);
  }
}

function mapApolloPersonToLead(person) {
  const org = person.organization || {};
  const phone = getBestPhone(person);
  return {
    businessName: org.name || '',
    ownerFirstName: person.first_name || '',
    ownerLastName: person.last_name || '',
    phoneNumber: phone,
    city: extractCity(person, org),
    website: org.website_url || org.primary_domain || '',
  };
}

function getBestPhone(person) {
  const phones = person.phone_numbers || [];
  const mobile = phones.find((p) => p.type === 'mobile');
  const direct = phones.find((p) => p.type === 'direct');
  const any = phones[0];
  const best = mobile || direct || any;
  return best?.sanitized_number || best?.raw_number || '';
}

function extractCity(person, org) {
  if (person.city) return person.city;
  if (org.city) return org.city;
  const loc = person.present_raw_address || org.raw_address || '';
  const parts = loc.split(',');
  return parts.length >= 2 ? parts[parts.length - 2].trim() : '';
}

function isValidLead(lead) {
  return lead.businessName.length > 0 && lead.phoneNumber.length > 0;
}

module.exports = { searchHVACLeads, SW_MICHIGAN_CITIES, TARGET_TITLES };
