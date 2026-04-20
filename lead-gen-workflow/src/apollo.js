/**
 * Apollo.io API client
 * Searches for HVAC decision-makers in Southwest Michigan with phone numbers.
 *
 * To change cities: edit SW_MICHIGAN_CITIES below.
 * To change industries: edit HVAC_KEYWORD_TAGS below.
 * To change targeted roles: edit TARGET_JOB_TITLES below.
 */

'use strict';

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// ─── Search configuration — easy to modify ───────────────────────────────────

const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Priority order matters: Apollo returns results matching any title, we sort by priority later
const TARGET_JOB_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'Co Founder',
  'General Manager',
];

// Apollo keyword tags for industry filtering
const HVAC_KEYWORD_TAGS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating ventilation and air conditioning',
];

// Apollo employee count ranges — closest bands to 1-25.
// "21,50" is the smallest Apollo band that covers 21+; results are post-filtered to ≤25.
const EMPLOYEE_RANGES = ['1,10', '11,20', '21,50'];

// Title priority map for sorting results (lower number = higher priority)
const TITLE_PRIORITY = {
  owner: 1,
  president: 2,
  founder: 3,
  'co-founder': 4,
  'co founder': 4,
  'general manager': 5,
};

// ─── API call ─────────────────────────────────────────────────────────────────

/**
 * Searches Apollo for HVAC leads and returns formatted contacts with phone numbers.
 * @param {number} maxResults - Maximum number of leads to return
 * @returns {Promise<Array>} Array of formatted lead objects
 */
async function searchLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': apiKey,
  };

  // Request slightly more than needed so filtering for phone numbers still gives us enough
  const fetchCount = Math.min(maxResults * 2, 100);

  const payload = {
    per_page: fetchCount,
    page: 1,
    person_titles: TARGET_JOB_TITLES,
    person_locations: SW_MICHIGAN_CITIES,
    organization_locations: ['Michigan, United States'],
    organization_num_employees_ranges: EMPLOYEE_RANGES,
    q_organization_keyword_tags: HVAC_KEYWORD_TAGS,
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, { headers });
  } catch (err) {
    const detail = err.response?.data?.message || err.response?.data?.error || err.message;
    throw new Error(`Apollo API request failed: ${detail}`);
  }

  const people = response.data?.people || [];

  // Keep only contacts that have at least one phone number
  const withPhones = people.filter(hasPhone);

  // Sort by title priority so Owner/President appear first
  withPhones.sort((a, b) => titlePriority(a) - titlePriority(b));

  // Return up to maxResults formatted contacts
  return withPhones.slice(0, maxResults).map(formatContact);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasPhone(person) {
  return (
    (person.phone_numbers && person.phone_numbers.length > 0) ||
    !!person.mobile_phone ||
    !!person.organization?.phone
  );
}

function getBestPhone(person) {
  // Prefer direct/mobile numbers over org main line
  if (person.phone_numbers?.length) {
    const direct = person.phone_numbers.find((p) => p.type === 'direct' || p.type === 'mobile');
    return (direct || person.phone_numbers[0]).raw_number;
  }
  return person.mobile_phone || person.organization?.phone || '';
}

function titlePriority(person) {
  const title = (person.title || '').toLowerCase();
  for (const [key, priority] of Object.entries(TITLE_PRIORITY)) {
    if (title.includes(key)) return priority;
  }
  return 99;
}

function formatContact(person) {
  const city =
    person.city ||
    person.organization?.city ||
    extractCity(person.present_raw_address) ||
    '';

  return {
    businessName: person.organization?.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: getBestPhone(person),
    city: city,
    website: person.organization?.website_url || '',
  };
}

function extractCity(rawAddress) {
  if (!rawAddress) return '';
  return rawAddress.split(',')[0].trim();
}

// ─── Connection test ──────────────────────────────────────────────────────────

async function testConnection() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set.');

  // A minimal search to verify the key is accepted
  const response = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    { per_page: 1, page: 1 },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
    }
  );

  return response.data?.pagination?.total_entries ?? 'connected';
}

module.exports = { searchLeads, testConnection };
