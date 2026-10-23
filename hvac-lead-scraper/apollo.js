/**
 * Apollo.io API integration
 * Searches for HVAC decision-makers in Southwest Michigan
 *
 * To modify search filters, edit the SEARCH_CONFIG object below.
 * Apollo API docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// ─── SEARCH FILTERS ──────────────────────────────────────────────────────────
// Industry keywords sent to Apollo's q_keywords field (OR logic internally)
const INDUSTRY_KEYWORDS = 'HVAC heating cooling air conditioning plumbing mechanical contractor';

// Job titles to target, in priority order (index 0 = highest priority)
const TITLE_PRIORITY_ORDER = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'co founder',
  'general manager',
];

// Phone type preference: mobile/direct lines are worth more than main office lines
const PHONE_TYPE_PRIORITY = [
  'mobile',
  'direct_phone',
  'work_direct',
  'work_hq',
  'other',
];
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a sort-weight for a job title string (lower = higher priority)
 */
function getTitleWeight(title) {
  if (!title) return 999;
  const lower = title.toLowerCase();
  const idx = TITLE_PRIORITY_ORDER.findIndex((t) => lower.includes(t));
  return idx === -1 ? 999 : idx;
}

/**
 * Picks the best available phone number from an Apollo phone_numbers array.
 * Prefers mobile/direct lines; falls back to any number present.
 */
function extractBestPhone(phoneNumbers) {
  if (!phoneNumbers || phoneNumbers.length === 0) return null;
  for (const type of PHONE_TYPE_PRIORITY) {
    const match = phoneNumbers.find((p) => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  return phoneNumbers.find((p) => p.sanitized_number)?.sanitized_number ?? null;
}

/**
 * Formats a 10-digit sanitized number as (555) 123-4567 for readability.
 */
function formatPhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw; // return as-is if format is unexpected
}

/**
 * Searches Apollo.io for HVAC decision-makers in the supplied cities.
 *
 * @param {string[]} cities   - City names (e.g. ['Kalamazoo', 'Holland'])
 * @param {number}   maxResults - Maximum leads to return
 * @returns {Promise<Array>}  - Normalized lead objects
 */
async function searchHvacLeads(cities, maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  // Build Apollo location strings: "City, Michigan, United States"
  const organizationLocations = cities.map((c) => `${c}, Michigan, United States`);

  const requestBody = {
    api_key: apiKey,
    page: 1,
    per_page: Math.min(maxResults * 2, 100), // fetch extra to account for phone-less contacts
    person_titles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],
    organization_locations: organizationLocations,
    organization_num_employees_ranges: ['1,25'], // owner-operated small businesses only
    q_keywords: INDUSTRY_KEYWORDS,
  };

  let response;
  try {
    response = await axios.post(
      `${APOLLO_BASE_URL}/people/search`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 30_000,
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    throw new Error(`Apollo API request failed (HTTP ${status ?? 'network error'}): ${detail}`);
  }

  const people = response.data?.people ?? [];
  if (people.length === 0) return [];

  // Keep only contacts that have at least one phone number
  const withPhone = people.filter(
    (p) => p.phone_numbers && p.phone_numbers.length > 0
  );

  // Sort by title priority so highest-value contacts come first
  withPhone.sort((a, b) => getTitleWeight(a.title) - getTitleWeight(b.title));

  // Map Apollo fields → our lead schema
  const leads = withPhone.slice(0, maxResults).map((person) => {
    const phone = extractBestPhone(person.phone_numbers);
    return {
      dateAdded: new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
      businessName: (person.organization_name || person.organization?.name || '').trim(),
      ownerFirstName: (person.first_name || '').trim(),
      ownerLastName: (person.last_name || '').trim(),
      phone: formatPhone(phone),
      city: (person.city || '').trim(),
      website: person.organization?.website_url || '',
    };
  });

  // Final safety filter: must have phone AND business name
  return leads.filter((l) => l.phone && l.businessName);
}

/**
 * Verifies that the Apollo API key is valid by running a minimal test query.
 */
async function verifyApolloConnection() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const response = await axios.post(
    `${APOLLO_BASE_URL}/people/search`,
    {
      api_key: apiKey,
      page: 1,
      per_page: 1,
      person_titles: ['Owner'],
      organization_locations: ['Michigan, United States'],
    },
    {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      timeout: 15_000,
    }
  );

  const total = response.data?.pagination?.total_entries ?? 0;
  return { success: true, totalAvailable: total };
}

module.exports = { searchHvacLeads, verifyApolloConnection };
