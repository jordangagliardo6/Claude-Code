'use strict';

/**
 * Apollo.io people search
 * Targets HVAC/plumbing/mechanical decision-makers in Southwest Michigan.
 *
 * Apollo API docs: https://apolloio.github.io/apollo-api-docs/
 * Endpoint: POST https://api.apollo.io/v1/mixed_people/search
 */

const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// ─── Configurable filters ──────────────────────────────────────────────────

// Job titles, searched in priority order (Owner first, GM last).
// Edit this array to add/remove titles.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Southwest Michigan cities + county/region terms for broader coverage.
// Apollo matches these against person city AND organization city fields.
// Edit this array to target different areas.
const TARGET_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
  // Broader fallbacks so we don't miss nearby towns
  'Berrien Springs, Michigan, United States',
  'Stevensville, Michigan, United States',
  'Coloma, Michigan, United States',
  'Portage, Michigan, United States',
  'Battle Creek, Michigan, United States',
  'Zeeland, Michigan, United States',
];

// Keywords used for a broad text match on organization name/industry when
// Apollo cannot filter by industry tag IDs directly.
// Apollo will rank contacts whose employer names/descriptions match these terms.
const HVAC_KEYWORDS = [
  'HVAC',
  'heating',
  'air conditioning',
  'cooling',
  'plumbing',
  'mechanical',
  'furnace',
  'boiler',
  'refrigeration',
  'ventilation',
];

// Apollo's organization_num_employees_ranges uses "min,max" strings.
// 1–25 covers true owner-operated small businesses.
const EMPLOYEE_RANGES = ['1,25'];

// ─── Client-side industry guard ───────────────────────────────────────────

// After Apollo returns results we run a lightweight keyword check on the
// company name/industry label to filter out clearly off-topic contacts.
// This is a secondary defence; the q_keywords param handles most filtering.
const INDUSTRY_KEYWORDS_RE = new RegExp(
  HVAC_KEYWORDS.map(k => k.replace(/\s+/g, '\\s+')).join('|'),
  'i'
);

function isHvacRelated(person) {
  const orgName     = person.organization?.name            || '';
  const industryTag = person.organization?.industry        || '';
  const keywords    = (person.organization?.keywords || []).join(' ');
  const combined    = `${orgName} ${industryTag} ${keywords}`;
  return INDUSTRY_KEYWORDS_RE.test(combined);
}

// ─── Phone extraction ─────────────────────────────────────────────────────

function extractBestPhone(person) {
  const phones = person.phone_numbers || [];
  if (phones.length === 0) return '';

  // Prefer mobile → direct → any
  const ranked = ['mobile', 'direct', 'work_hq', 'work', 'other'];
  for (const type of ranked) {
    const match = phones.find(p => p.type === type);
    if (match) return match.sanitized_number || match.raw_number || '';
  }
  // Fallback: first available number
  return phones[0].sanitized_number || phones[0].raw_number || '';
}

// ─── City extraction ──────────────────────────────────────────────────────

function extractCity(person) {
  return person.city ||
         person.organization?.city ||
         '';
}

// ─── Main search function ─────────────────────────────────────────────────

/**
 * Search Apollo for HVAC decision-makers in Southwest Michigan.
 * @param {number} maxResults  Max contacts to request (default: MAX_LEADS_PER_RUN env var or 25)
 * @param {number} page        Page number for pagination (default: 1)
 * @returns {Promise<Array<{businessName, firstName, lastName, phone, city, website}>>}
 */
async function searchLeads(maxResults, page = 1) {
  const limit = maxResults || parseInt(process.env.MAX_LEADS_PER_RUN, 10) || 25;

  logger.info(`Querying Apollo — page ${page}, up to ${limit} results`);

  const payload = {
    api_key: process.env.APOLLO_API_KEY,

    // Title filter (exact match list; Apollo also applies partial matching)
    person_titles: TARGET_TITLES,

    // Location filter: person city OR organization city in these areas
    person_locations: TARGET_LOCATIONS,
    organization_locations: ['Michigan, United States'],

    // Company size: 1–25 employees only
    organization_num_employees_ranges: EMPLOYEE_RANGES,

    // Only return contacts that have at least one phone number
    contact_phone_numbers_exist: true,

    // Broad keyword relevance boost toward HVAC/plumbing companies
    q_keywords: HVAC_KEYWORDS.slice(0, 5).join(' '), // Apollo limits keyword length

    per_page: Math.min(limit, 100), // Apollo max per_page is 100
    page,
  };

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

    const { people = [], pagination } = response.data;
    logger.info(`Apollo returned ${people.length} contacts (total available: ${pagination?.total_entries ?? '?'})`);

    // Map to our flat lead shape, applying secondary HVAC filter
    const leads = people
      .filter(isHvacRelated)
      .map(person => ({
        businessName: (person.organization?.name || '').trim(),
        firstName:    (person.first_name || '').trim(),
        lastName:     (person.last_name  || '').trim(),
        phone:        extractBestPhone(person),
        city:         extractCity(person),
        website:      (person.organization?.website_url || '').trim(),
      }))
      // Hard exclude contacts with no phone (belt-and-suspenders)
      .filter(lead => lead.phone && lead.businessName);

    logger.info(`${leads.length} leads passed HVAC industry filter`);
    return leads;

  } catch (err) {
    const apolloMsg = err.response?.data?.error || err.response?.data?.message;
    const status    = err.response?.status;
    throw new Error(
      `Apollo API error${status ? ` (HTTP ${status})` : ''}: ${apolloMsg || err.message}`
    );
  }
}

/**
 * Verify the Apollo API key is valid by calling the profile endpoint.
 * @returns {Promise<string>} The authenticated user's email
 */
async function verifyApolloConnection() {
  const response = await axios.get(`${APOLLO_BASE_URL}/users/me`, {
    params: { api_key: process.env.APOLLO_API_KEY },
    timeout: 10_000,
  });
  return response.data?.user?.email || 'unknown';
}

module.exports = { searchLeads, verifyApolloConnection };
