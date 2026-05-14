/**
 * Apollo.io API client
 *
 * Searches for HVAC decision-makers in Southwest Michigan.
 * Docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// ─── Search configuration ─────────────────────────────────────────────────────

// Priority-ordered job titles. Apollo does partial/fuzzy matching.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industries to target (Apollo matches these against company industry tags)
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Mechanical or Industrial Engineering',
];

// Southwest Michigan cities — easy to extend
const TARGET_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
  // Surrounding areas
  'Stevensville, Michigan, United States',
  'Bridgman, Michigan, United States',
  'Coloma, Michigan, United States',
  'Paw Paw, Michigan, United States',
  'Portage, Michigan, United States',
];

// ─── API call ─────────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC leads.
 *
 * @param {object} options
 * @param {number} options.maxResults  - Max contacts to return (default 25)
 * @param {number} options.page        - Page offset for pagination (default 1)
 * @returns {Promise<Array>} Array of normalized lead objects
 */
async function searchLeads({ maxResults = 25, page = 1 } = {}) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment');

  const payload = {
    page,
    per_page: Math.min(maxResults, 25), // Apollo max per page is 25 on most plans
    person_titles: TARGET_TITLES,
    organization_num_employees_ranges: ['1,25'],
    person_locations: TARGET_LOCATIONS,
    // Require at least one phone number on the contact record
    contact_phone_types_include: ['direct_phone', 'mobile_phone', 'corporate_phone'],
    // Only return contacts that have a phone number
    has_phone: true,
    // Sort by job seniority so Owners surface first
    sort_by_field: '[person_title]',
    sort_ascending: true,
  };

  logger.info(`Querying Apollo — page ${page}, up to ${payload.per_page} results`);

  const response = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    }
  );

  const { people = [], contacts = [], total_entries } = response.data;
  const raw = people.length ? people : contacts; // endpoint returns one or the other

  logger.info(`Apollo returned ${raw.length} records (${total_entries ?? '?'} total matches)`);

  // Normalize to a flat lead object
  const leads = raw
    .map(normalizePerson)
    .filter(isUsableLead);

  logger.info(`${leads.length} leads passed phone-required filter`);
  return leads;
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizePerson(p) {
  const org = p.organization || p.employment_history?.[0] || {};

  // Pick the best available phone number in priority order
  const phone =
    p.direct_dial_phone ||
    p.mobile_phone ||
    p.phone_numbers?.[0]?.raw_number ||
    p.sanitized_phone ||
    '';

  // City: prefer person city, fall back to org city
  const city =
    p.city ||
    p.present_raw_address?.split(',')[0] ||
    org.city ||
    '';

  return {
    businessName: org.name || p.organization_name || '',
    firstName: p.first_name || '',
    lastName: p.last_name || '',
    phone: phone.replace(/\s+/g, ''), // strip whitespace
    city: city.trim(),
    website: org.website_url || org.domain || '',
    title: p.title || '',
  };
}

function isUsableLead(lead) {
  // Must have a business name and at least a phone number
  return Boolean(lead.businessName && lead.phone);
}

// ─── Connection test ──────────────────────────────────────────────────────────

async function testConnection() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment');

  // Light-weight endpoint — just verify auth
  const response = await axios.get(`${APOLLO_BASE_URL}/users/me`, {
    headers: { 'X-Api-Key': apiKey },
    timeout: 10_000,
  });

  return response.data?.user || response.data;
}

module.exports = { searchLeads, testConnection, TARGET_LOCATIONS, TARGET_TITLES };
