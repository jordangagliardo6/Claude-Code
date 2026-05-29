'use strict';

/**
 * Apollo.io API client
 *
 * Searches for HVAC owner/decision-maker contacts in Southwest Michigan.
 * Uses the /api/v1/mixed_people/search endpoint which returns people with
 * their associated company data in a single call.
 */

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// ---------------------------------------------------------------------------
// Configuration — edit these arrays to change targeting
// ---------------------------------------------------------------------------

/**
 * Southwest Michigan cities. Each entry becomes an org-location filter in
 * Apollo so results are biased to companies headquartered in these cities.
 * Add or remove entries freely.
 */
const SW_MICHIGAN_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

// Apollo's organization_locations filter expects "City, State, Country" strings.
const APOLLO_LOCATIONS = SW_MICHIGAN_CITIES.map(
  (city) => `${city}, Michigan, United States`
);

/**
 * HVAC industry keywords used in the q_keywords filter.
 * Apollo will match these against company descriptions and industry tags.
 * Modify to broaden or narrow the industry scope.
 */
const INDUSTRY_KEYWORDS =
  'HVAC "heating and air conditioning" plumbing "mechanical contractor" "mechanical contracting"';

/**
 * Target job titles in priority order.
 * Apollo scores and returns contacts matching any of these titles.
 * Results are sorted by Apollo's internal relevance; we re-sort by priority below.
 */
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Title priority map used when sorting multiple contacts from the same company.
const TITLE_PRIORITY = Object.fromEntries(
  TARGET_TITLES.map((t, i) => [t.toLowerCase(), i])
);

/**
 * Apollo employee range buckets that cover 1–25 employees.
 * Apollo uses inclusive buckets; "21,50" slightly over-includes (up to 50)
 * but is the closest available bucket for the 21–25 range.
 */
const EMPLOYEE_RANGES = ['1,10', '11,20', '21,50'];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildHeaders() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': apiKey,
  };
}

/**
 * Returns the best available phone number for a contact.
 * Priority: mobile → direct → any other type.
 * Returns null when the contact has no phone numbers.
 */
function extractBestPhone(contact) {
  const phones = contact.phone_numbers || [];
  if (!phones.length) return null;

  const byType = (type) => phones.find((p) => p.type === type);
  const best = byType('mobile') || byType('direct') || phones[0];
  // sanitized_number strips formatting; fall back to raw_number
  return best.sanitized_number || best.raw_number || null;
}

/**
 * Returns the numeric priority of a contact's title (lower = higher priority).
 * Unknown titles get the lowest priority (TARGET_TITLES.length).
 *
 * Partial-match entries are sorted longest-first so "co-founder" is tested
 * before "founder" — otherwise "Co-Founder" would incorrectly inherit
 * "Founder"'s higher priority via the substring match.
 */
function titlePriority(title = '') {
  const key = title.toLowerCase().trim();
  // Exact match wins
  if (TITLE_PRIORITY[key] !== undefined) return TITLE_PRIORITY[key];
  // Partial match: check longer canonicals first to avoid false early match
  const byLength = Object.entries(TITLE_PRIORITY).sort(([a], [b]) => b.length - a.length);
  for (const [canonical, priority] of byLength) {
    if (key.includes(canonical)) return priority;
  }
  return TARGET_TITLES.length;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search Apollo for HVAC contacts in Southwest Michigan.
 *
 * @param {number} page      - 1-based page number
 * @param {number} perPage   - Results per page (max 100 per Apollo limits)
 * @returns {object}         - Raw Apollo API response
 */
async function searchHvacLeads(page = 1, perPage = 25) {
  const payload = {
    q_keywords: INDUSTRY_KEYWORDS,
    person_titles: TARGET_TITLES,
    // Org-level location filter targets companies in SW Michigan cities
    organization_locations: APOLLO_LOCATIONS,
    organization_num_employees_ranges: EMPLOYEE_RANGES,
    per_page: perPage,
    page,
  };

  const response = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/search`,
    payload,
    { headers: buildHeaders(), timeout: 30_000 }
  );

  return response.data;
}

/**
 * Validates the API key by calling the profile endpoint.
 * Throws on failure (invalid key, network error, etc.).
 *
 * @returns {object} - Apollo user profile object
 */
async function testConnection() {
  const response = await axios.get(`${APOLLO_BASE_URL}/users/me`, {
    headers: buildHeaders(),
    timeout: 10_000,
  });
  return response.data;
}

/**
 * Converts a raw Apollo contact object into a normalized lead record.
 * Returns null if the contact has no phone number (required field).
 *
 * @param {object} contact - Raw Apollo contact
 * @returns {object|null}
 */
function normalizeContact(contact) {
  const phone = extractBestPhone(contact);
  if (!phone) return null; // Skip contacts without phone numbers

  const org = contact.organization || {};

  return {
    businessName: org.name || contact.organization_name || '',
    firstName: contact.first_name || '',
    lastName: contact.last_name || '',
    phone,
    city:
      org.city ||
      contact.city ||
      // Apollo sometimes returns the address string; extract city portion
      (contact.present_raw_address || '').split(',')[0]?.trim() ||
      '',
    website: org.website_url || '',
    title: contact.title || '',
  };
}

/**
 * Fetches up to `limit` normalized leads from Apollo.
 * Filters out contacts without phone numbers and skips records with no
 * business name (can't deduplicate or store them meaningfully).
 * Sorts results so higher-priority titles appear first within each company.
 *
 * @param {number} limit - Maximum number of leads to return
 * @returns {object[]}   - Array of normalized lead objects
 */
async function fetchLeads(limit = 25) {
  const data = await searchHvacLeads(1, Math.min(limit, 100));
  const contacts = data.contacts || data.people || data.results || [];

  if (!contacts.length) {
    const total = data.pagination?.total_entries ?? 0;
    throw new Error(
      `Apollo returned 0 contacts (total_entries reported: ${total}). ` +
        'Check your API key, search filters, or Apollo plan limits.'
    );
  }

  const leads = contacts
    .map(normalizeContact)
    .filter((lead) => lead !== null && lead.businessName.trim() !== '');

  // Sort by title priority so Owner/President appear before General Manager
  leads.sort((a, b) => titlePriority(a.title) - titlePriority(b.title));

  return leads.slice(0, limit);
}

module.exports = {
  fetchLeads,
  testConnection,
  SW_MICHIGAN_CITIES,
  TARGET_TITLES,
};
