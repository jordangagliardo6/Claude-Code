/**
 * apollo.js
 * Thin wrapper around the Apollo.io REST API.
 *
 * Endpoint used: POST /api/v1/mixed_people/search
 *   - Returns people (prospecting, not enrichment) — phone numbers are
 *     included when Apollo has them on record for the contact.
 *   - Responses that have no phone numbers are filtered out downstream.
 *
 * Apollo docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');
const logger = require('./logger');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

/**
 * Search Apollo for HVAC decision-makers in Southwest Michigan.
 *
 * Apollo's people search only returns contacts at companies matching ALL
 * of the org-level filters. We fan out across the target cities by passing
 * all locations in one request (Apollo ORs them internally).
 *
 * @param {number} page - 1-based page number
 * @returns {Promise<{ people: object[], totalCount: number }>}
 */
async function searchPeople(page = 1) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  const payload = {
    // Decision-maker titles, priority order. Apollo does fuzzy matching.
    person_titles: config.targetTitles,

    // Only show results where at least one title matches strictly enough.
    include_similar_titles: true,

    // Company HQ locations (Apollo ORs these).
    organization_locations: config.targetLocations,

    // Owner-operated small businesses only.
    organization_num_employees_ranges: config.employeeRanges,

    // Industry keyword tags (Apollo ORs these against org tags).
    q_organization_keyword_tags: config.industryKeywords,

    // SIC codes for plumbing/HVAC contractors.
    // Apollo maps SIC codes to organizations it knows about.
    // (Kept as strings per the Apollo schema.)
    // Note: we pass these via the org keyword filter because the
    // mixed_people endpoint does not expose a direct SIC filter.
    // The SIC codes are already embedded in industryKeywords via the
    // company-search approach; keeping them here as reference.

    // Pagination
    page,
    per_page: config.apolloPageSize,
  };

  logger.info(`Apollo search — page ${page}, ${config.apolloPageSize} results requested`);

  const response = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      timeout: 30_000,
    }
  );

  const { people = [], pagination = {} } = response.data;
  const totalCount = pagination.total_entries || people.length;

  logger.info(`Apollo returned ${people.length} people (total matching: ${totalCount})`);

  return { people, totalCount };
}

/**
 * Normalize a raw Apollo person record into the flat shape used by the workflow.
 * Returns null if the contact has no usable phone number (per the user requirement).
 *
 * @param {object} person - Raw Apollo person object
 * @returns {object|null}
 */
function normalizePerson(person) {
  // Collect all available phone numbers and pick the best one.
  const phones = [
    ...(person.phone_numbers || []),
  ];

  // Prefer direct/mobile numbers over office numbers.
  const bestPhone = pickBestPhone(phones);
  if (!bestPhone) return null; // skip contacts with no phone

  const org = person.organization || {};

  return {
    businessName:  (org.name || '').trim(),
    firstName:     (person.first_name || '').trim(),
    lastName:      (person.last_name || '').trim(),
    phoneNumber:   bestPhone,
    city:          extractCity(person, org),
    website:       normalizeUrl(org.website_url || person.website_url || ''),
  };
}

/**
 * Pick the highest-priority phone number from Apollo's phone_numbers array.
 * Apollo returns objects like: { raw_number, sanitized_number, type, ... }
 * Priority: mobile > direct > work > other
 */
function pickBestPhone(phones) {
  if (!phones || phones.length === 0) return null;

  const priority = ['mobile', 'direct', 'work', 'other', null];

  for (const type of priority) {
    const match = phones.find(
      (p) => (type === null || (p.type || '').toLowerCase() === type) &&
             p.sanitized_number
    );
    if (match) return match.sanitized_number;
  }

  // Fallback: return any non-empty raw number
  const fallback = phones.find((p) => p.raw_number);
  return fallback ? fallback.raw_number : null;
}

/**
 * Extract the most specific city string from the person or org data.
 */
function extractCity(person, org) {
  // Apollo sometimes gives city directly on the person object.
  if (person.city) return person.city.trim();
  if (person.present_raw_address) {
    const parts = person.present_raw_address.split(',');
    if (parts.length >= 1) return parts[0].trim();
  }
  if (org.raw_address) {
    const parts = org.raw_address.split(',');
    if (parts.length >= 1) return parts[0].trim();
  }
  if (org.city) return org.city.trim();
  return '';
}

/**
 * Ensure the website URL has a protocol prefix.
 */
function normalizeUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (url && !url.startsWith('http')) return `https://${url}`;
  return url;
}

module.exports = { searchPeople, normalizePerson };
