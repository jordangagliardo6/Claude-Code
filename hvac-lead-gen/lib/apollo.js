/**
 * Apollo.io REST API client for HVAC lead prospecting.
 *
 * Requires a PAID Apollo plan (Basic or above) — the mixed_people/search
 * endpoint is not available on the free tier.
 *
 * To modify the city list, edit SW_MICHIGAN_LOCATIONS below.
 * To modify industry keywords, edit HVAC_KEYWORDS below.
 * To change which job titles are targeted, edit TARGET_TITLES below.
 */

const axios = require('axios');

const APOLLO_API_BASE = 'https://api.apollo.io/api/v1';

// ─── Easy-to-modify configuration ────────────────────────────────────────────

// Cities/areas to target — Apollo matches these against where the PERSON is based.
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Industry tags — Apollo matches these against company keyword tags.
const HVAC_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
];

// Target job titles in priority order (Owner first, General Manager last).
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Company size filter: 1–25 employees (owner-operated small businesses).
const EMPLOYEE_RANGES = ['1,25'];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC decision-makers in Southwest Michigan.
 * Returns an array of lead objects (businessName, firstName, lastName, phone, city, website).
 * Contacts without a phone number are excluded.
 */
async function searchHvacLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment variables.');

  const payload = {
    api_key: apiKey,
    person_titles: TARGET_TITLES,
    person_locations: SW_MICHIGAN_LOCATIONS,
    organization_num_employees_ranges: EMPLOYEE_RANGES,
    q_organization_keyword_tags: HVAC_KEYWORDS,
    per_page: 100, // fetch generously; we'll trim to MAX_LEADS after dedup
    page: 1,
  };

  let response;
  try {
    response = await axios.post(
      `${APOLLO_API_BASE}/mixed_people/search`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30_000,
      }
    );
  } catch (err) {
    if (err.response?.status === 403 || err.response?.data?.error_code === 'API_INACCESSIBLE') {
      throw new Error(
        'Apollo API returned 403 — your account is on the Free plan. ' +
        'Upgrade at https://www.apollo.io/pricing to enable people search.'
      );
    }
    throw new Error(`Apollo API request failed: ${err.message}`);
  }

  const people = response.data?.people ?? [];
  if (people.length === 0) return [];

  return people
    .map(person => ({
      businessName: person.organization?.name ?? '',
      firstName:    person.first_name ?? '',
      // Apollo masks last names on some plans — strip the asterisks if present.
      lastName:     (person.last_name ?? '').replace(/\*/g, '').trim(),
      phone:        extractBestPhone(person),
      city:         person.city ?? person.organization?.city ?? '',
      website:      person.organization?.website_url ?? '',
    }))
    .filter(lead => lead.businessName && lead.phone); // exclude contacts with no phone
}

/**
 * Picks the best available phone number from Apollo's phone_numbers array.
 * Prefers mobile/direct over a generic work number.
 */
function extractBestPhone(person) {
  const phones = person.phone_numbers ?? [];

  const preferred = phones.find(p => p.type === 'mobile' || p.type === 'direct_dial');
  if (preferred) return preferred.sanitized_number || preferred.raw_number;

  const work = phones.find(p => p.type === 'work');
  if (work) return work.sanitized_number || work.raw_number;

  // Fall back to the top-level sanitized_phone if available
  return person.sanitized_phone ?? '';
}

module.exports = { searchHvacLeads };
