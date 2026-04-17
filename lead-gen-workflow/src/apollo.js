const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// ─── Configurable search parameters ─────────────────────────────────────────
// Edit CITIES to add/remove target areas. Each entry becomes an OR condition.
const CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Apollo keyword tags that map to HVAC-adjacent industries
const INDUSTRY_TAGS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating, ventilating & air conditioning',
];

// Job titles in priority order — Apollo ranks results so top titles float up
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Small owner-operated businesses only: 1–25 employees
const EMPLOYEE_RANGE = '1,25';

/**
 * Search Apollo.io for HVAC decision-makers matching the configured filters.
 * @param {number} perPage - max contacts to retrieve (default: 25)
 * @returns {Promise<Array>} normalized lead objects
 */
async function searchHvacLeads(perPage = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  logger.info(`Searching Apollo.io for up to ${perPage} HVAC leads in Southwest Michigan...`);

  const payload = {
    api_key: apiKey,
    page: 1,
    per_page: perPage,

    // Location filter — Apollo accepts "City, State" strings
    person_locations: CITIES,

    // Job title filter (OR logic between entries)
    person_titles: TARGET_TITLES,

    // Company industry keyword tags (OR logic)
    q_organization_keyword_tags: INDUSTRY_TAGS,

    // Employee count: "min,max" format
    organization_num_employees_ranges: [EMPLOYEE_RANGE],

    // Only return contacts Apollo has a phone number for
    contact_phone_number_status: ['likely_to_be_correct', 'guessed'],

    // Always pull these fields in the response
    prospected_by_current_team: ['no'],
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE_URL}/mixed_people/search`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;
    throw new Error(`Apollo API request failed (HTTP ${status}): ${detail}`);
  }

  const raw = response.data?.people || [];
  logger.info(`Apollo returned ${raw.length} raw result(s).`);

  // Normalize each person into a flat lead object
  const leads = raw
    .map(normalizeLead)
    .filter(lead => lead.phone); // hard filter: skip if still no phone

  logger.info(`${leads.length} lead(s) passed the phone-number filter.`);
  return leads;
}

/**
 * Map a raw Apollo person object to our standard lead shape.
 */
function normalizeLead(person) {
  const phone =
    person.mobile_phone ||
    person.phone_number ||
    (Array.isArray(person.phone_numbers) && person.phone_numbers[0]?.sanitized_number) ||
    null;

  return {
    businessName: person.organization?.name?.trim() || '',
    firstName:    person.first_name?.trim() || '',
    lastName:     person.last_name?.trim() || '',
    phone:        phone ? phone.trim() : '',
    city:         person.city?.trim() || person.organization?.city?.trim() || '',
    website:      person.organization?.website_url?.trim() || '',
  };
}

/**
 * Quick connectivity check — verifies the API key is valid.
 */
async function testConnection() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  try {
    const resp = await axios.get(`${APOLLO_BASE_URL}/users/me`, {
      params: { api_key: apiKey },
      timeout: 10_000,
    });
    const name = resp.data?.user?.name || 'unknown user';
    logger.info(`Apollo.io connection OK — authenticated as: ${name}`);
    return true;
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;
    throw new Error(`Apollo.io connection test failed (HTTP ${status}): ${detail}`);
  }
}

module.exports = { searchHvacLeads, testConnection };
