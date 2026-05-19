/**
 * Apollo.io integration — searches for HVAC decision-makers in SW Michigan.
 *
 * To add or remove target cities, edit TARGET_LOCATIONS.
 * To change industries, edit INDUSTRY_KEYWORDS.
 * To change which titles are targeted, edit TARGET_TITLES.
 */

const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// ── Edit these arrays freely ──────────────────────────────────────────────────

const TARGET_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating ventilation air conditioning',
];

// Priority order matters: Apollo returns results ranked by relevance,
// so listing Owner first biases toward owner-operated businesses.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC decision-makers in SW Michigan.
 * Filters out any result without a phone number.
 * Returns up to `maxResults` normalized lead objects.
 */
async function searchHVACLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  logger.info(`Querying Apollo for up to ${maxResults} HVAC leads in SW Michigan...`);

  const response = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/search`,
    {
      api_key: apiKey,
      person_titles: TARGET_TITLES,
      person_locations: TARGET_LOCATIONS,
      organization_locations: TARGET_LOCATIONS,
      organization_num_employees_ranges: ['1,25'],
      q_organization_keyword_tags: INDUSTRY_KEYWORDS,
      // Strict title matching — set to true if results are too sparse
      include_similar_titles: false,
      per_page: Math.min(maxResults * 2, 100), // fetch extra to offset phone-less contacts
      page: 1,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    }
  );

  const people = response.data?.people ?? [];
  logger.info(`Apollo returned ${people.length} raw results`);

  const leads = people
    .map(normalizeContact)
    .filter((lead) => {
      if (!lead.phone) {
        logger.info(`No phone — skipping: ${lead.businessName || lead.firstName + ' ' + lead.lastName}`);
        return false;
      }
      return true;
    });

  logger.info(`${leads.length} leads have a phone number`);
  return leads.slice(0, maxResults);
}

/**
 * Map an Apollo person object to our internal lead shape.
 */
function normalizeContact(person) {
  const org = person.organization ?? {};
  const phone = pickBestPhone(person.phone_numbers ?? [], person.sanitized_phone);

  return {
    businessName: org.name ?? person.employment_history?.[0]?.organization_name ?? '',
    firstName:    person.first_name ?? '',
    lastName:     person.last_name  ?? '',
    phone,
    city:    formatCity(person.city, person.state),
    website: org.website_url ?? '',
  };
}

/**
 * Select the best phone number from the array, preferring mobile > direct > work.
 * Falls back to Apollo's pre-selected sanitized_phone.
 */
function pickBestPhone(phoneNumbers, sanitizedFallback) {
  const priority = ['mobile', 'direct', 'work', 'other'];
  for (const type of priority) {
    const match = phoneNumbers.find((p) => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  return sanitizedFallback ?? phoneNumbers[0]?.sanitized_number ?? '';
}

function formatCity(city, state) {
  if (city && state) return `${city}, ${state}`;
  return city ?? state ?? '';
}

module.exports = { searchHVACLeads };
