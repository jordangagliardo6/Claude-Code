/**
 * apollo.js — Apollo.io API integration
 *
 * Searches for HVAC owner/decision-maker contacts in Southwest Michigan.
 * API docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// Southwest Michigan cities to search — add or remove as needed
const SW_MICHIGAN_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

// Target industries — Apollo keyword tags
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
];

// Job titles in priority order — Apollo searches all but we sort by priority later
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Title priority map for sorting (lower number = higher priority)
const TITLE_PRIORITY = {
  owner: 1,
  president: 2,
  founder: 3,
  'co-founder': 4,
  'general manager': 5,
};

/**
 * Returns a numeric priority for a given job title string.
 * Unrecognized titles get priority 99 (lowest).
 */
function getTitlePriority(title) {
  if (!title) return 99;
  const normalized = title.toLowerCase().trim();
  for (const [key, val] of Object.entries(TITLE_PRIORITY)) {
    if (normalized.includes(key)) return val;
  }
  return 99;
}

/**
 * Searches Apollo.io for HVAC contacts matching the configured filters.
 *
 * @param {string} apiKey - Apollo API key from environment
 * @param {number} maxResults - Maximum number of leads to return
 * @returns {Promise<Array>} Array of normalized lead objects
 */
async function searchHvacLeads(apiKey, maxResults = 25) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'x-api-key': apiKey,
  };

  // Build location string for Southwest Michigan
  const locations = SW_MICHIGAN_CITIES.map((city) => `${city}, Michigan, United States`);

  const payload = {
    api_key: apiKey,
    // Target job titles
    person_titles: TARGET_TITLES,
    // Industry keywords
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    // Michigan locations, biased toward Southwest
    person_locations: locations,
    // 1–25 employees = owner-operated small businesses
    organization_num_employees_ranges: ['1,25'],
    // Only return contacts that have at least one phone number
    contact_phone_number: true,
    // Pagination — fetch enough to honor maxResults after deduplication
    page: 1,
    per_page: Math.min(maxResults * 2, 100), // fetch 2x to account for post-filtering
  };

  let rawPeople = [];

  try {
    const response = await axios.post(
      `${APOLLO_BASE_URL}/mixed_people/search`,
      payload,
      { headers, timeout: 30_000 }
    );

    rawPeople = response.data?.people ?? [];
    console.log(`[Apollo] Raw results returned: ${rawPeople.length}`);
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error ?? err.message;
    throw new Error(`Apollo API error (HTTP ${status}): ${detail}`);
  }

  // Filter, normalize, and sort
  const leads = rawPeople
    .filter(hasMobileOrDirectPhone)
    .map(normalizeLead)
    .filter((lead) => lead !== null)
    .sort((a, b) => getTitlePriority(a.jobTitle) - getTitlePriority(b.jobTitle));

  // Return at most maxResults
  return leads.slice(0, maxResults);
}

/**
 * Returns true if the person has a mobile or direct phone number.
 */
function hasMobileOrDirectPhone(person) {
  const phones = person.phone_numbers ?? [];
  return phones.some(
    (p) => p.type === 'mobile' || p.type === 'direct' || p.sanitized_number
  );
}

/**
 * Picks the best phone number from a person's phone_numbers array.
 * Prefers mobile → direct → first available.
 */
function pickBestPhone(phoneNumbers) {
  if (!phoneNumbers?.length) return '';
  const mobile = phoneNumbers.find((p) => p.type === 'mobile');
  if (mobile?.sanitized_number) return mobile.sanitized_number;
  const direct = phoneNumbers.find((p) => p.type === 'direct');
  if (direct?.sanitized_number) return direct.sanitized_number;
  return phoneNumbers[0]?.sanitized_number ?? phoneNumbers[0]?.raw_number ?? '';
}

/**
 * Normalizes a raw Apollo person object into our lead schema.
 * Returns null if required fields are missing.
 */
function normalizeLead(person) {
  const phone = pickBestPhone(person.phone_numbers);
  if (!phone) return null; // skip contacts with no phone

  return {
    businessName: person.organization?.name ?? person.employment_history?.[0]?.organization_name ?? '',
    firstName: person.first_name ?? '',
    lastName: person.last_name ?? '',
    phone,
    city: person.city ?? '',
    website: person.organization?.website_url ?? '',
    jobTitle: person.title ?? '',
  };
}

module.exports = { searchHvacLeads, SW_MICHIGAN_CITIES };
