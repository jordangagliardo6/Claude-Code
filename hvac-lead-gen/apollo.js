/**
 * apollo.js
 * Searches Apollo.io for HVAC owner/decision-maker contacts in Southwest Michigan.
 * Uses the Apollo REST API directly — no SDK required.
 */

'use strict';

const axios = require('axios');

const APOLLO_API_BASE = 'https://api.apollo.io/api/v1';

// ── Targeting Config ──────────────────────────────────────────────────────────
// Edit these arrays to change cities, industries, or titles without touching
// the core search logic.

const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Heating, Ventilation & Air Conditioning',
  'Air Conditioning',
  'Heating',
];

// Listed in priority order — Owner first, General Manager last.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Searches Apollo for HVAC leads and returns up to `maxResults` contacts
 * that have at least one phone number.
 *
 * @param {number} maxResults  Maximum contacts to return (default 25)
 * @returns {Promise<Array<{businessName, firstName, lastName, phone, city, website}>>}
 */
async function searchHVACLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in your .env file');

  console.log(`[Apollo] Searching SW Michigan HVAC leads (want ${maxResults} with phones)…`);

  // Fetch a larger pool so we have room to filter out contacts with no phone.
  const fetchSize = Math.min(maxResults * 3, 100);

  const payload = {
    // Authentication
    api_key: apiKey,

    // ── Location filters ──────────────────────────────────────────────────
    // Filter by where the COMPANY is located (SW Michigan cities + state fallback)
    organization_locations: SW_MICHIGAN_CITIES,

    // ── Company size: owner-operated small businesses only ────────────────
    // "1,25" means 1–25 employees
    organization_num_employees_ranges: ['1,25'],

    // ── Industry keywords ─────────────────────────────────────────────────
    q_organization_keyword_tags: TARGET_INDUSTRIES,

    // ── Job titles (priority order) ───────────────────────────────────────
    person_titles: TARGET_TITLES,
    // include_similar_titles: true lets Apollo expand to related titles
    // (e.g. "Co-Owner", "Managing Partner") — helpful for small businesses
    include_similar_titles: true,

    // Bias toward owner-level seniority
    person_seniorities: ['owner', 'founder', 'c_suite'],

    // ── Pagination ────────────────────────────────────────────────────────
    per_page: fetchSize,
    page: 1,
  };

  let people;
  try {
    const response = await axios.post(
      `${APOLLO_API_BASE}/mixed_people/search`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 30_000,
      }
    );
    people = response.data?.people ?? [];
  } catch (err) {
    if (err.response) {
      throw new Error(
        `Apollo API error ${err.response.status}: ${JSON.stringify(err.response.data)}`
      );
    }
    throw err;
  }

  console.log(`[Apollo] Raw results returned: ${people.length}`);

  const leads = [];

  for (const person of people) {
    if (leads.length >= maxResults) break;

    const phone = extractBestPhone(person);

    // Skip anyone without a phone — per your requirement
    if (!phone) {
      console.log(`[Apollo] No phone — skipping ${person.name || '(unnamed)'}`);
      continue;
    }

    const org = person.organization || {};

    leads.push({
      businessName : org.name || person.organization_name || '',
      firstName    : person.first_name || '',
      lastName     : person.last_name  || '',
      phone,
      city         : extractCity(person, org),
      website      : org.website_url || person.website_url || '',
    });
  }

  console.log(`[Apollo] ${leads.length} leads kept (have phone numbers)`);
  return leads;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Picks the best phone number from Apollo's phone_numbers array.
 * Preference: direct > mobile > work > corporate > any.
 */
function extractBestPhone(person) {
  const numbers = person.phone_numbers ?? [];

  const preferredTypes = [
    'direct_phone',
    'mobile_phone',
    'work_direct_phone',
    'work_phone',
    'corporate_phone',
    'other_phone',
  ];

  for (const type of preferredTypes) {
    const match = numbers.find(n => n.type === type && n.sanitized_number);
    if (match) return match.sanitized_number;
  }

  // Any number with a sanitized value
  const any = numbers.find(n => n.sanitized_number);
  if (any) return any.sanitized_number;

  // Last resort: top-level phone fields Apollo sometimes returns
  return person.direct_phone || person.mobile_phone || person.phone || null;
}

/**
 * Returns the city string from a person or their organization's address.
 */
function extractCity(person, org) {
  if (person.city) return person.city;

  if (person.present_raw_address) {
    return person.present_raw_address.split(',')[0].trim();
  }

  if (org.raw_address) {
    return org.raw_address.split(',')[0].trim();
  }

  return '';
}

module.exports = { searchHVACLeads, SW_MICHIGAN_CITIES, TARGET_INDUSTRIES, TARGET_TITLES };
