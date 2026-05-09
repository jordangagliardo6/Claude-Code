const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// ─── Easy to modify: cities you want to target ───────────────────────────────
const TARGET_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// ─── Easy to modify: job titles in priority order ────────────────────────────
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ─── Easy to modify: industries to target ────────────────────────────────────
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
];

/**
 * Search Apollo.io for HVAC leads in Southwest Michigan.
 * Returns an array of normalized lead objects with phone numbers only.
 *
 * @param {number} maxResults - Cap on results (1–25)
 * @returns {Promise<Array<{businessName, firstName, lastName, phone, city, website, title}>>}
 */
async function searchHVACLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const payload = {
    api_key: apiKey,
    person_titles: TARGET_TITLES,
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    person_locations: TARGET_CITIES,
    // 1–25 employee range — owner-operated small businesses
    organization_num_employees_ranges: ['1,25'],
    per_page: Math.min(maxResults, 25),
    page: 1,
  };

  let data;
  try {
    const response = await axios.post(
      `${APOLLO_BASE_URL}/mixed_people/search`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 30_000,
      }
    );
    data = response.data;
  } catch (error) {
    throw buildApolloError(error);
  }

  const people = data?.people ?? [];
  if (people.length === 0) return [];

  return people
    .filter(hasPhone)
    .map(normalizeLead)
    .filter(lead => lead.businessName); // must have a company name
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasPhone(person) {
  return (
    !!person.direct_phone ||
    !!person.mobile_phone ||
    (Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0)
  );
}

function normalizeLead(person) {
  return {
    businessName: person.organization?.name ?? '',
    firstName:    person.first_name ?? '',
    lastName:     person.last_name  ?? '',
    phone:        extractBestPhone(person),
    city:         person.city ?? extractCityFromLocation(person),
    website:      person.organization?.website_url ?? '',
    title:        person.title ?? '',
  };
}

// Priority: direct > mobile > first available
function extractBestPhone(person) {
  const candidates = [
    person.direct_phone,
    person.mobile_phone,
    ...(person.phone_numbers ?? []).map(p => p.sanitized_number ?? p.raw_number),
  ].filter(Boolean);

  return candidates.length ? formatPhone(candidates[0]) : '';
}

function formatPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10)
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1')
    return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return raw;
}

function extractCityFromLocation(person) {
  if (person.city) return person.city;
  if (typeof person.location === 'string') return person.location.split(',')[0].trim();
  return '';
}

function buildApolloError(error) {
  if (!error.response) return new Error(`Apollo.io connection failed: ${error.message}`);
  const { status, data } = error.response;
  const msg = data?.message ?? error.response.statusText;
  if (status === 401) return new Error(`Apollo.io authentication failed: ${msg}. Check APOLLO_API_KEY.`);
  if (status === 429) return new Error(`Apollo.io rate limit exceeded: ${msg}. Try again later.`);
  return new Error(`Apollo.io API error (${status}): ${msg}`);
}

// ─── Connection test ──────────────────────────────────────────────────────────

async function testConnection() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return { success: false, message: 'APOLLO_API_KEY is not set' };

  try {
    await axios.post(
      `${APOLLO_BASE_URL}/mixed_people/search`,
      { api_key: apiKey, per_page: 1, page: 1 },
      { timeout: 15_000 }
    );
    return { success: true, message: 'Apollo.io connection successful' };
  } catch (error) {
    if (error.response?.status === 401)
      return { success: false, message: 'Apollo.io: invalid API key (401)' };
    return { success: false, message: `Apollo.io connection failed: ${error.message}` };
  }
}

module.exports = {
  searchHVACLeads,
  testConnection,
  TARGET_CITIES,
  TARGET_TITLES,
  INDUSTRY_KEYWORDS,
};
