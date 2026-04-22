// Apollo.io REST API client
// Docs: https://apolloio.github.io/apollo-api-docs/
const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// ─── Target geography ─────────────────────────────────────────────────────────
// Modify this list to add or remove cities at any time.
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

// Apollo location strings for person/org search — city + state format
const PERSON_LOCATIONS = TARGET_CITIES.map(city => `${city}, Michigan, United States`);

// ─── Industry keywords ────────────────────────────────────────────────────────
// These are matched against Apollo's organization keyword tags.
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'air conditioning',
  'heating',
  'ventilation',
];

// ─── Decision-maker titles (priority order) ───────────────────────────────────
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

/**
 * Search Apollo.io for HVAC decision-makers in Southwest Michigan.
 * Returns transformed lead objects that already have a phone number.
 *
 * @param {number} page    - Apollo results page to fetch (1-indexed)
 * @param {number} perPage - Max contacts to request (≤ 25 keeps cost low)
 * @returns {Promise<Array>} Array of lead objects
 */
async function searchHVACLeads(page = 1, perPage = 25) {
  logger.info(`Querying Apollo.io — page ${page}, up to ${perPage} results`);

  const payload = {
    api_key: process.env.APOLLO_API_KEY,
    page,
    per_page: perPage,
    person_titles: TARGET_TITLES,
    // Broad org-location filter so Apollo returns MI results; city narrowing
    // happens via person_locations and the post-filter below.
    organization_locations: ['Michigan, United States'],
    person_locations: PERSON_LOCATIONS,
    organization_num_employees_ranges: ['1,25'],
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
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
    const detail = err.response?.data?.message || err.message;
    throw new Error(`Apollo API request failed: ${detail}`);
  }

  const people = response.data?.people || [];
  const total = response.data?.pagination?.total_entries ?? 0;
  logger.info(`Apollo returned ${people.length} contacts on page ${page} (${total} total)`);

  if (people.length === 0) return [];

  const leads = people
    .filter(hasPhoneNumber)
    .map(transformPerson);

  logger.info(`${leads.length} of ${people.length} contacts have a phone number`);
  return leads;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasPhoneNumber(person) {
  return Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0;
}

function transformPerson(person) {
  // Prefer mobile over work numbers
  const phones = person.phone_numbers || [];
  const mobile = phones.find(p => p.type === 'mobile');
  const best = mobile || phones[0];
  const phone = best?.sanitized_number || best?.raw_number || '';

  // Normalise city: prefer contact's city, fall back to org city
  const city = person.city || person.organization?.city || '';
  const state = person.state || person.organization?.state || '';

  // Normalise website
  const website =
    person.organization?.website_url ||
    (person.organization?.primary_domain
      ? `https://${person.organization.primary_domain}`
      : '');

  return {
    businessName: person.organization?.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    title: person.title || '',
    phone,
    city: [city, state !== 'Michigan' ? state : ''].filter(Boolean).join(', '),
    website,
  };
}

module.exports = { searchHVACLeads, TARGET_CITIES, TARGET_TITLES, INDUSTRY_KEYWORDS };
