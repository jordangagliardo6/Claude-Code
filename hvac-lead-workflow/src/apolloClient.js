/**
 * apolloClient.js
 *
 * Wraps the Apollo.io v1 people-search API.
 * Filters for HVAC decision-makers at small companies in Southwest Michigan.
 *
 * To change target cities, edit SW_MICHIGAN_LOCATIONS.
 * To change job-title priority, edit TARGET_TITLES.
 */

const axios = require('axios');

const APOLLO_API_BASE = 'https://api.apollo.io/v1';

// Add or remove cities/counties here as needed.
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
  'Berrien County, Michigan, United States',
  'Allegan County, Michigan, United States',
  'Ottawa County, Michigan, United States',
  'Kalamazoo County, Michigan, United States',
  'Muskegon County, Michigan, United States',
];

// Apollo returns people sorted by best-match; we also filter client-side.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'Co Founder',
  'General Manager',
];

// Keyword tags passed to Apollo's industry filter.
const HVAC_KEYWORDS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Heating, Ventilation and Air Conditioning',
  'Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Heating and Cooling',
  'HVAC Services',
];

/**
 * Fetch one page of HVAC decision-makers.
 *
 * @param {number} page     - 1-based page number
 * @param {number} perPage  - results per page (max 100 for Apollo)
 * @returns {{ leads: Lead[], totalAvailable: number }}
 */
async function searchHVACLeads(page = 1, perPage = 50) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }

  const payload = {
    page,
    per_page: perPage,

    // ── Person filters ────────────────────────────────────────────────────
    person_titles: TARGET_TITLES,

    // ── Company filters ───────────────────────────────────────────────────
    organization_locations: SW_MICHIGAN_LOCATIONS,
    organization_num_employees_ranges: ['1,25'],     // owner-operated small businesses
    q_organization_keyword_tags: HVAC_KEYWORDS,

    // Only return contacts that have at least one phone number in Apollo's DB.
    // Apollo supports this as a boolean field in some plans; we also filter
    // client-side below to be safe.
    contact_phone_excluded: false,
  };

  let response;
  try {
    response = await axios.post(
      `${APOLLO_API_BASE}/mixed_people/search`,
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
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const msg = err.response.data?.message || err.response.statusText || 'unknown error';
      throw new Error(`Apollo API responded with ${status}: ${msg}`);
    }
    throw new Error(`Apollo API request failed: ${err.message}`);
  }

  const { people = [], pagination = {} } = response.data;

  // Filter client-side: must have a phone number.
  const withPhone = people.filter(hasPhone);

  const leads = withPhone.map(mapToLead);

  return {
    leads,
    totalAvailable: pagination.total_entries ?? people.length,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasPhone(person) {
  return (
    !!person.mobile_phone ||
    (Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0) ||
    !!person.organization?.primary_phone?.number
  );
}

/**
 * Maps a raw Apollo person object to the shape used by the rest of the app.
 * @typedef {{ businessName: string, firstName: string, lastName: string,
 *             phone: string, city: string, website: string, title: string }} Lead
 */
function mapToLead(person) {
  return {
    businessName: person.organization?.name?.trim() || '',
    firstName:    person.first_name?.trim() || '',
    lastName:     person.last_name?.trim() || '',
    phone:        pickBestPhone(person),
    city:         pickCity(person),
    website:      pickWebsite(person),
    title:        person.title?.trim() || '',
  };
}

function pickBestPhone(person) {
  const raw =
    person.mobile_phone ||
    person.phone_numbers?.find(p => p.type === 'mobile')?.sanitized_number ||
    person.phone_numbers?.find(p => p.type === 'direct')?.sanitized_number ||
    person.phone_numbers?.[0]?.sanitized_number ||
    person.organization?.primary_phone?.number ||
    '';
  return formatPhone(raw);
}

function formatPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw; // return original if we can't normalize it
}

function pickCity(person) {
  return (
    person.city?.trim() ||
    person.organization?.city?.trim() ||
    ''
  );
}

function pickWebsite(person) {
  const site =
    person.organization?.website_url ||
    person.organization?.primary_domain ||
    '';
  if (!site) return '';
  // Ensure it starts with https:// for clarity
  return site.startsWith('http') ? site : `https://${site}`;
}

module.exports = { searchHVACLeads, TARGET_TITLES, SW_MICHIGAN_LOCATIONS };
