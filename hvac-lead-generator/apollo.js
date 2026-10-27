/**
 * Apollo.io API integration for HVAC lead searches.
 *
 * Apollo docs: https://apolloio.github.io/apollo-api-docs/
 * Endpoint: POST /v1/mixed_people/search
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// Southwest Michigan cities and their zip codes for location bias
const SW_MICHIGAN_LOCATIONS = [
  { city: 'St. Joseph',   state: 'Michigan', zip: '49085' },
  { city: 'Benton Harbor', state: 'Michigan', zip: '49022' },
  { city: 'Kalamazoo',    state: 'Michigan', zip: '49001' },
  { city: 'Holland',      state: 'Michigan', zip: '49423' },
  { city: 'Grand Haven',  state: 'Michigan', zip: '49417' },
  { city: 'Muskegon',     state: 'Michigan', zip: '49440' },
  { city: 'South Haven',  state: 'Michigan', zip: '49090' },
];

// Apollo industry keywords covering HVAC and related trades
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating, Ventilation & Air Conditioning',
  'Plumbing',
  'Mechanical or Industrial Engineering',
];

// Decision-maker titles in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

/**
 * Search Apollo for HVAC contacts in Southwest Michigan.
 * Returns an array of normalized lead objects.
 *
 * @param {string} apiKey   APOLLO_API_KEY
 * @param {number} maxLeads Maximum results to return
 * @param {number} page     1-indexed page (used internally for pagination)
 */
async function searchHVACLeads(apiKey, maxLeads = 25, page = 1) {
  const perPage = Math.min(maxLeads, 25); // Apollo caps at 25 per page on free plans

  const payload = {
    api_key: apiKey,
    page,
    per_page: perPage,

    // Target cities (Apollo accepts an array of city strings)
    person_locations: SW_MICHIGAN_LOCATIONS.map(l => `${l.city}, ${l.state}, US`),

    // Decision-maker titles
    person_titles: TARGET_TITLES,

    // Company size 1–25 (owner-operated)
    organization_num_employees_ranges: ['1,25'],

    // Must have a phone number
    contact_email_status: [], // don't restrict by email
    has_phone: true,

    // Keywords to narrow to HVAC trades — Apollo uses q_keywords for fuzzy matching
    q_keywords: 'HVAC heating air conditioning plumbing mechanical contracting',

    // Return only the fields we need to keep response payloads small
    fields: [
      'id',
      'first_name',
      'last_name',
      'title',
      'phone_numbers',
      'mobile_phone',
      'organization',
      'city',
      'state',
      'country',
    ],
  };

  const response = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    }
  );

  const people = response.data?.people ?? [];

  return people
    .filter(p => hasPhoneNumber(p)) // belt-and-suspenders phone check
    .map(normalizePerson);
}

/** Return true if Apollo returned at least one phone number for this contact. */
function hasPhoneNumber(person) {
  if (person.mobile_phone) return true;
  if (Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0) return true;
  return false;
}

/**
 * Pick the best phone number (mobile preferred, then first available).
 * Returns a formatted string like +12695551234 or null.
 */
function bestPhone(person) {
  if (person.mobile_phone) return person.mobile_phone;
  if (Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0) {
    return person.phone_numbers[0].sanitized_number ?? person.phone_numbers[0].raw_number ?? null;
  }
  return null;
}

/** Map an Apollo person record to our internal lead shape. */
function normalizePerson(person) {
  const org = person.organization ?? {};
  return {
    businessName: org.name ?? '',
    ownerFirstName: person.first_name ?? '',
    ownerLastName: person.last_name ?? '',
    phone: bestPhone(person) ?? '',
    city: person.city ?? org.city ?? '',
    website: org.website_url ?? '',
    title: person.title ?? '',
  };
}

module.exports = { searchHVACLeads, SW_MICHIGAN_LOCATIONS };
