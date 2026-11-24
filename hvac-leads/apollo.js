/**
 * Apollo.io search module.
 * Searches for HVAC decision-makers in SW Michigan with phone numbers.
 */

const axios = require('axios');

// Cities to target — edit this list to change the search area
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

// Job titles in priority order — highest priority first
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'Co Founder',
  'General Manager',
];

// Keywords Apollo uses to filter by industry
const HVAC_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'heating and cooling',
  'air conditioning',
  'mechanical contracting',
  'plumbing',
  'heating',
  'ventilation',
];

const APOLLO_API_URL = 'https://api.apollo.io/v1/mixed_people/search';

/**
 * Search Apollo.io for HVAC decision-makers in SW Michigan.
 * Returns an array of normalized lead objects ready for the spreadsheet.
 *
 * @param {string} apiKey - Apollo.io API key
 * @param {number} maxResults - Maximum leads to fetch (default 25)
 * @returns {Promise<Array>} Array of lead objects
 */
async function searchHVACLeads(apiKey, maxResults = 25) {
  const locations = SW_MICHIGAN_CITIES.map(
    (city) => `${city}, Michigan, United States`
  );

  const payload = {
    api_key: apiKey,
    person_titles: TARGET_TITLES,
    organization_locations: locations,
    // 1–25 employees targets owner-operated small businesses
    organization_num_employees_ranges: ['1,25'],
    q_organization_keyword_tags: HVAC_KEYWORDS,
    page: 1,
    per_page: maxResults,
  };

  const response = await axios.post(APOLLO_API_URL, payload, {
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    timeout: 30000,
  });

  const people = response.data.people || [];
  console.log(`Apollo returned ${people.length} raw result(s)`);

  return people
    .map(normalizeLead)
    .filter((lead) => lead !== null); // drop leads with no phone
}

/**
 * Quick connection test — searches for 1 result to confirm the API key works.
 * @param {string} apiKey
 * @returns {Promise<boolean>}
 */
async function testConnection(apiKey) {
  const payload = {
    api_key: apiKey,
    person_titles: ['Owner'],
    organization_locations: ['Kalamazoo, Michigan, United States'],
    page: 1,
    per_page: 1,
  };

  const response = await axios.post(APOLLO_API_URL, payload, {
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    timeout: 15000,
  });

  // Any 2xx with a people array (even empty) means the key is valid
  return Array.isArray(response.data.people);
}

/**
 * Normalize a raw Apollo person object into the spreadsheet row shape.
 * Returns null if no usable phone number was found.
 *
 * @param {Object} person - Raw Apollo person object
 * @returns {Object|null} Normalized lead or null
 */
function normalizeLead(person) {
  const phone = extractBestPhone(person);
  if (!phone) return null; // skip — no phone number

  const org = person.organization || {};

  return {
    businessName: org.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone,
    city: person.city || org.city || '',
    website: org.website_url || '',
  };
}

/**
 * Pick the best available phone in this order:
 * mobile → direct → first available → organization primary phone
 *
 * @param {Object} person
 * @returns {string|null} Formatted phone number or null
 */
function extractBestPhone(person) {
  const numbers = person.phone_numbers || [];

  if (numbers.length > 0) {
    // Prefer mobile, then direct, then whatever is first
    const priority = ['mobile', 'direct'];
    for (const type of priority) {
      const match = numbers.find((n) => n.type === type && n.sanitized_number);
      if (match) return formatPhone(match.sanitized_number);
    }
    // Fallback: first number with any value
    const first = numbers.find((n) => n.sanitized_number || n.raw_number);
    if (first) return formatPhone(first.sanitized_number || first.raw_number);
  }

  // Last resort: organization primary phone
  const orgPhone = person.organization?.primary_phone?.number;
  if (orgPhone) return formatPhone(orgPhone);

  return null;
}

/**
 * Normalize a phone number to (XXX) XXX-XXXX or leave as-is if it doesn't
 * look like a 10-digit US number.
 *
 * @param {string} raw
 * @returns {string}
 */
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  // Strip leading country code 1 if present
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return raw; // return original if format is unexpected
}

module.exports = { searchHVACLeads, testConnection, SW_MICHIGAN_CITIES, TARGET_TITLES };
