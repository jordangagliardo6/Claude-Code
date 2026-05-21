/**
 * Apollo.io API client
 *
 * Docs: https://apolloio.github.io/apollo-api-docs/
 * Auth: API key passed in request body (or x-api-key header on v1 endpoints)
 */

const axios  = require('axios');
const config = require('./config');
const logger = require('./logger');

const BASE_URL = 'https://api.apollo.io/api/v1';

// ── Helpers ────────────────────────────────────────────────────────────────

function getApiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY environment variable is not set');
  return key;
}

/**
 * Apollo expects location strings like "St. Joseph, Michigan, United States"
 */
function buildLocationFilters() {
  return config.cities.map(city => `${city}, United States`);
}

/**
 * Pick the best available phone number from an Apollo person record.
 * Priority: mobile → direct → first in phone_numbers array
 */
function extractPhone(person) {
  if (person.mobile_phone)       return person.mobile_phone;
  if (person.direct_phone_number) return person.direct_phone_number;
  const nums = person.phone_numbers || [];
  if (nums.length > 0) return nums[0].sanitized_number || nums[0].raw_number || '';
  return '';
}

/**
 * Pull the city from the person record. Apollo may store it in several places.
 */
function extractCity(person) {
  if (person.city)     return person.city;
  // person.location is sometimes "Kalamazoo, MI, US"
  if (person.location) return person.location.split(',')[0].trim();
  return '';
}

/**
 * Convert an Apollo "person" object into our standard lead shape.
 */
function normalizePerson(person) {
  const org = person.organization || {};
  return {
    businessName: org.name || person.organization_name || '',
    firstName:    person.first_name || '',
    lastName:     person.last_name  || '',
    phone:        extractPhone(person),
    city:         extractCity(person),
    website:      org.website_url || person.website_url || '',
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC decision-makers in Southwest Michigan.
 *
 * @param {number} page     1-based page number
 * @param {number} perPage  Max results to return (capped at 25 by config)
 * @returns {{ contacts: Array, totalCount: number }}
 */
async function searchContacts(page = 1, perPage = config.maxLeadsPerRun) {
  const apiKey = getApiKey();

  const payload = {
    api_key: apiKey,

    // Decision-maker titles in priority order
    person_titles: config.jobTitles,

    // Small businesses only: 1–25 employees
    organization_num_employees_ranges: [config.employeeRange],

    // Southwest Michigan cities
    person_locations: buildLocationFilters(),

    // HVAC / plumbing industry keywords
    q_organization_keyword_tags: config.industries,

    // Only contacts with at least one verified phone
    contact_phone_number_status: ['verified', 'likely_to_engage'],

    page,
    per_page: perPage,
  };

  logger.info('Querying Apollo.io', {
    page,
    perPage,
    locations: payload.person_locations,
    titles:    payload.person_titles,
  });

  try {
    const { data } = await axios.post(
      `${BASE_URL}/mixed_people/search`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 30_000,
      }
    );

    const people     = data.people || [];
    const pagination = data.pagination || {};

    logger.info(`Apollo returned ${people.length} people`, {
      totalAvailable: pagination.total_entries,
    });

    return {
      contacts:   people.map(normalizePerson),
      totalCount: pagination.total_entries || 0,
    };
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    logger.error('Apollo search failed', { status, detail });
    throw new Error(`Apollo API error (HTTP ${status}): ${detail}`);
  }
}

/**
 * Lightweight connection test — calls /users/me to validate the API key.
 */
async function verifyConnection() {
  const apiKey = getApiKey();

  const { data } = await axios.get(`${BASE_URL}/users/me`, {
    params:  { api_key: apiKey },
    timeout: 10_000,
  });

  const user = data?.user || {};
  return {
    connected: true,
    email: user.email || 'unknown',
    name:  `${user.first_name || ''} ${user.last_name || ''}`.trim(),
  };
}

module.exports = { searchContacts, verifyConnection };
