/**
 * apollo.js — Apollo.io People Search client
 *
 * Searches for HVAC/plumbing company owners in Southwest Michigan.
 * Returns an array of normalized lead objects ready for the spreadsheet.
 *
 * To change target cities: edit SW_MICHIGAN_CITIES below.
 * To change job titles: edit TARGET_TITLES below.
 * To change industries: edit INDUSTRY_KEYWORDS below.
 */

const axios = require('axios');

// ─── Configuration ────────────────────────────────────────────────────────────

// Cities and surrounding areas in Southwest Michigan
// Each entry is matched against the Apollo "person_locations" filter.
const SW_MICHIGAN_CITIES = [
  'Saint Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
  // Surrounding areas
  'Portage, Michigan, United States',
  'Allegan, Michigan, United States',
  'Berrien Springs, Michigan, United States',
  'Stevensville, Michigan, United States',
  'Coloma, Michigan, United States',
  'Zeeland, Michigan, United States',
];

// Job titles in priority order (Apollo returns the best match first)
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industry keywords Apollo will match against company keyword tags
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Heating, Ventilation & Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Air Conditioning',
  'Heating and Cooling',
];

const APOLLO_API_BASE = 'https://api.apollo.io/v1';

// ─── Main search function ─────────────────────────────────────────────────────

/**
 * Fetches HVAC leads from Apollo.io.
 *
 * @param {number} maxResults   Maximum contacts to return (default 25)
 * @param {number} startPage    Apollo results page to start from (default 1)
 * @returns {Promise<Lead[]>}   Array of normalized lead objects
 */
async function fetchHvacLeads(maxResults = 25, startPage = 1) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment variables.');

  const body = {
    // Industry matching
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,

    // Decision-maker job titles (sent in priority order)
    person_titles: TARGET_TITLES,

    // Location: Southwest Michigan cities
    person_locations: SW_MICHIGAN_CITIES,

    // Fallback: also match org headquartered in Michigan
    organization_locations: ['Michigan, United States'],

    // Small/owner-operated businesses: 1–25 employees
    organization_num_employees_ranges: ['1,10', '11,25'],

    // Request phone data — Apollo will only include contacts where phone is available
    contact_phone_numbers_quality: ['likely_valid', 'verified'],

    // Pagination
    page: startPage,
    per_page: maxResults,
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_API_BASE}/mixed_people/search`, body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': apiKey,
      },
      timeout: 30_000,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;
    if (status === 401) throw new Error(`Apollo API key invalid or expired (401). ${detail}`);
    if (status === 429) throw new Error(`Apollo rate limit hit (429). Try again later. ${detail}`);
    throw new Error(`Apollo API request failed (${status ?? 'network error'}): ${detail}`);
  }

  const people = response.data?.people ?? [];
  if (people.length === 0) return [];

  // Normalize each person into a flat lead object
  return people
    .map(normalizePerson)
    .filter(lead => lead.phone); // drop contacts with no phone at all
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalizes a raw Apollo "person" object into a flat lead object.
 * Extracts the best available phone number (mobile preferred, then direct, then any).
 */
function normalizePerson(person) {
  const org = person.organization || {};

  // Phone: prefer mobile → direct → first available number
  const phone = pickBestPhone(person);

  // City: prefer person's city, fall back to org city
  const city =
    person.city ||
    person.state ||
    org.city ||
    '';

  return {
    businessName: org.name || person.organization_name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone,
    city,
    website: cleanUrl(org.website_url || person.organization_website_url || ''),
    title: person.title || '',       // kept for logging/debugging; not written to sheet
    apolloId: person.id || '',       // used for deduplication in memory if needed
  };
}

/**
 * Returns the best phone number from an Apollo contact.
 * Priority: mobile → direct_dial → first phone in phone_numbers array.
 */
function pickBestPhone(person) {
  // Apollo sometimes returns a top-level `mobile_phone` or `direct_dial_phone`
  if (person.mobile_phone) return person.mobile_phone;
  if (person.direct_dial_phone) return person.direct_dial_phone;

  // Otherwise scan the phone_numbers array
  const numbers = person.phone_numbers || [];
  const mobile = numbers.find(p => p.type === 'mobile' || p.type === 'cell');
  if (mobile) return mobile.sanitized_number || mobile.raw_number || '';

  const direct = numbers.find(p => p.type === 'direct_dial' || p.type === 'work_direct');
  if (direct) return direct.sanitized_number || direct.raw_number || '';

  const any = numbers[0];
  if (any) return any.sanitized_number || any.raw_number || '';

  return '';
}

/** Strips trailing slashes and common tracking params from a URL. */
function cleanUrl(url) {
  if (!url) return '';
  return url.replace(/\/$/, '').trim();
}

// ─── Connection test ──────────────────────────────────────────────────────────

/** Verifies the Apollo API key by fetching the current user's profile. */
async function testApolloConnection() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set.');

  const response = await axios.get(`${APOLLO_API_BASE}/users/api_profile`, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    timeout: 15_000,
  });

  const user = response.data?.user;
  return {
    name: `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Unknown',
    email: user?.email || 'Unknown',
    plan: response.data?.account?.plan_type || 'Unknown',
  };
}

module.exports = { fetchHvacLeads, testApolloConnection, SW_MICHIGAN_CITIES };
