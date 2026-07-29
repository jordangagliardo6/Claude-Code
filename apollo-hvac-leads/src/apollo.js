/**
 * apollo.js — Apollo.io people search for SW Michigan HVAC decision-makers.
 *
 * Calls POST /v1/mixed_people/search with industry, location, title, and
 * employee-count filters, then normalises the results into a flat lead object.
 *
 * To add cities: push to SW_MICHIGAN_CITIES.
 * To change industries: edit TARGET_KEYWORDS.
 * To change titles: edit TARGET_TITLES (priority order matters — first match wins).
 */

const axios = require('axios');

const APOLLO_API_BASE = 'https://api.apollo.io/v1';

// Cities and surrounding areas in Southwest Michigan.
// Apollo accepts "City, State, Country" strings.
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Apollo will match companies whose industry/tags contain any of these.
const TARGET_KEYWORDS = [
  'HVAC',
  'Heating',
  'Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
];

// Job titles to search for, in priority order.
// The first phone found on the matching person is used.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Apollo employee-count range filter: 1–25 employees only.
const EMPLOYEE_RANGE = ['1,25'];

/**
 * Search Apollo.io for HVAC decision-makers and return up to `limit` leads
 * that have at least one phone number.
 *
 * @param {number} limit  Max leads to return (default 25).
 * @returns {Promise<Array<{businessName, firstName, lastName, phone, city, website}>>}
 */
async function searchHvacLeads(limit = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in your .env file.');

  // Fetch more than we need so phone-filtering doesn't leave us short.
  const fetchCount = Math.min(limit * 3, 100);

  const payload = {
    api_key: apiKey,
    page: 1,
    per_page: fetchCount,
    person_titles: TARGET_TITLES,
    // Use city-level locations so results are biased to SW Michigan.
    person_locations: SW_MICHIGAN_CITIES,
    // 1–25 employees: owner-operated small businesses only.
    organization_num_employees_ranges: EMPLOYEE_RANGE,
    // Keyword filter narrows to HVAC / plumbing / mechanical companies.
    q_organization_keyword_tags: TARGET_KEYWORDS,
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_API_BASE}/mixed_people/search`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    });
  } catch (err) {
    const status = err.response?.status;
    const body   = err.response?.data;
    throw new Error(
      `Apollo API request failed (HTTP ${status ?? 'network error'}): ` +
      (body ? JSON.stringify(body) : err.message)
    );
  }

  const people = response.data?.people ?? [];

  if (!Array.isArray(people)) {
    throw new Error(`Unexpected Apollo response shape: ${JSON.stringify(response.data).slice(0, 200)}`);
  }

  // Keep only contacts that have at least one usable phone number.
  const withPhone = people.filter(p => bestPhone(p));

  console.log(
    `Apollo: ${people.length} people returned, ` +
    `${withPhone.length} have a phone number.`
  );

  return withPhone.slice(0, limit).map(normalise);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pick the best available phone from an Apollo person object.
 * Priority: direct > mobile > first phone_numbers entry > org phone.
 */
function bestPhone(p) {
  if (p.direct_phone)  return p.direct_phone;
  if (p.mobile_phone)  return p.mobile_phone;

  const numbered = p.phone_numbers ?? [];
  if (numbered.length) {
    // Prefer sanitised number if present, otherwise raw value.
    return numbered[0].sanitized_number || numbered[0].raw_number || '';
  }

  // Fall back to the company's main line — only for very small businesses.
  return p.organization?.phone ?? '';
}

/** Extract city from an Apollo location string like "St. Joseph, Michigan, United States". */
function extractCity(locationStr) {
  if (!locationStr) return '';
  const parts = locationStr.split(',');
  return parts[0]?.trim() ?? '';
}

/** Map an Apollo person object to our flat lead schema. */
function normalise(p) {
  const city =
    p.city ||
    extractCity(p.present_raw_address) ||
    p.organization?.city ||
    '';

  return {
    businessName: (p.organization?.name ?? p.organization_name ?? '').trim(),
    firstName:    (p.first_name ?? '').trim(),
    lastName:     (p.last_name  ?? '').trim(),
    phone:        bestPhone(p),
    city,
    website:      (p.organization?.website_url ?? p.website_url ?? '').trim(),
  };
}

module.exports = { searchHvacLeads };
