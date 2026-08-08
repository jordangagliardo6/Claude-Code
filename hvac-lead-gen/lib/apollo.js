'use strict';

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// ── Target geography ───────────────────────────────────────────────────────────
// Apollo matches these against the person's own city.
// Add or remove cities here at any time — the rest of the script adapts automatically.
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'St Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
  'Stevensville, Michigan',
  'Bridgman, Michigan',
  'Coloma, Michigan',
  'Watervliet, Michigan',
  'Portage, Michigan',
  'Grandville, Michigan',
  'Zeeland, Michigan',
  'Spring Lake, Michigan',
  'Norton Shores, Michigan',
];

// ── Target job titles (searched in Apollo; Apollo also returns similar titles) ──
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ── Industry keywords ─────────────────────────────────────────────────────────
// Matched against organization tags in Apollo's database.
const INDUSTRY_TAGS = [
  'hvac',
  'heating and air conditioning',
  'heating & cooling',
  'plumbing',
  'mechanical contracting',
  'air conditioning',
  'furnace',
  'ductwork',
  'heat pump',
  'refrigeration',
];

/**
 * Search Apollo's people database for HVAC decision-makers in SW Michigan.
 *
 * NOTE: This endpoint does NOT return phone numbers — phone numbers require
 * enrichment via enrichPeople(). Each enrichment call costs Apollo credits.
 *
 * @param {string} apiKey   Your Apollo API key (APOLLO_API_KEY env var)
 * @param {number} limit    Max candidates to fetch (fetch more than you need; some won't have phones)
 * @returns {Promise<Array>} Array of Apollo person objects
 */
async function searchHVACPeople(apiKey, limit = 100) {
  const response = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/search`,
    {
      person_titles: TARGET_TITLES,
      person_locations: SW_MICHIGAN_CITIES,
      organization_locations: ['Michigan, United States'],
      organization_num_employees_ranges: ['1,25'], // owner-operated small businesses only
      q_organization_keyword_tags: INDUSTRY_TAGS,
      per_page: Math.min(limit, 100),
      page: 1,
    },
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    }
  );

  return response.data.people || [];
}

/**
 * Enrich a batch of Apollo person IDs to retrieve phone numbers and full names.
 *
 * CREDIT COST: 1 enrichment credit per person ID passed in.
 * The caller controls batch size to manage credit usage per run.
 *
 * @param {string}   apiKey     Your Apollo API key
 * @param {string[]} personIds  Apollo person IDs from searchHVACPeople()
 * @returns {Promise<Array>}    Enriched person objects, each with phone_numbers[]
 */
async function enrichPeople(apiKey, personIds) {
  if (!personIds.length) return [];

  const response = await axios.post(
    `${APOLLO_BASE_URL}/people/bulk_match`,
    {
      reveal_personal_emails: false,
      reveal_phone_number: true,
      details: personIds.map(id => ({ id })),
    },
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    }
  );

  return response.data.matches || [];
}

/**
 * Pick the best available phone number from an Apollo phone_numbers array.
 * Priority: mobile > work/direct > any other type.
 * Returns a formatted US number like (269) 555-1234, or null if none available.
 *
 * @param {Array} phoneNumbers  The phone_numbers array from an enriched person object
 * @returns {string|null}
 */
function pickBestPhone(phoneNumbers) {
  if (!phoneNumbers?.length) return null;

  const ranked = ['mobile', 'direct', 'work', 'other'];
  let best = null;

  for (const type of ranked) {
    best = phoneNumbers.find(p => p.type === type);
    if (best) break;
  }

  if (!best) best = phoneNumbers[0];

  const raw = best.sanitized_number || best.raw_number;
  return formatUsPhone(raw);
}

// Format a raw phone string as (XXX) XXX-XXXX for US 10-digit numbers.
function formatUsPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '').replace(/^1/, ''); // strip country code
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw; // non-standard — return as-is
}

module.exports = { searchHVACPeople, enrichPeople, pickBestPhone, SW_MICHIGAN_CITIES };
