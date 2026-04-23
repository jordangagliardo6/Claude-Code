const axios = require('axios');
const {
  CITIES,
  JOB_TITLES,
  INDUSTRY_KEYWORDS,
  MIN_EMPLOYEES,
  MAX_EMPLOYEES,
} = require('./config');
const logger = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

/**
 * Search Apollo.io for HVAC decision-makers in Southwest Michigan.
 * Returns the raw array of person objects from the API.
 */
async function searchLeads(perPage = 25, page = 1) {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY environment variable is not set');
  }

  // Build location strings: "City, Michigan, United States"
  const personLocations = CITIES.map(city => `${city}, Michigan, United States`);

  const payload = {
    // Job title filter — Owner/President/etc in priority order
    person_titles: JOB_TITLES,

    // Company size: owner-operated small businesses only
    organization_num_employees_ranges: [`${MIN_EMPLOYEES},${MAX_EMPLOYEES}`],

    // Southwest Michigan cities
    person_locations: personLocations,

    // HVAC / plumbing / mechanical keyword search against company info
    q_keywords: INDUSTRY_KEYWORDS.join(' OR '),

    // Only surface contacts Apollo has a phone number for
    // Values: "verified" | "predicted" | "unverified"
    contact_phone_status: ['verified', 'predicted', 'unverified'],

    page,
    per_page: perPage,
  };

  logger.info(`Querying Apollo.io (page ${page}, up to ${perPage} results)...`);

  const response = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': process.env.APOLLO_API_KEY,
      },
      timeout: 30_000,
    }
  );

  const { people = [], pagination } = response.data;
  const total = pagination?.total_entries ?? 'unknown';

  logger.info(`Apollo returned ${people.length} contact(s) (total available: ${total})`);

  return people;
}

/**
 * Extract the fields we care about from a raw Apollo person object.
 * Returns null when the contact has no usable phone number.
 */
function extractLeadData(person) {
  // Prefer direct mobile, fall back to first phone number in list
  const phone =
    person.mobile_phone ||
    (person.phone_numbers?.length > 0
      ? person.phone_numbers[0].sanitized_number
      : '') ||
    '';

  if (!phone) return null;

  return {
    businessName: person.organization?.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone,
    city: person.city || person.organization?.city || '',
    website: person.organization?.website_url || '',
  };
}

/** Quick connectivity check — fetches exactly 1 result. */
async function verifyConnection() {
  try {
    await searchLeads(1, 1);
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    throw new Error(`Apollo.io connection failed: ${detail}`);
  }
}

module.exports = { searchLeads, extractLeadData, verifyConnection };
