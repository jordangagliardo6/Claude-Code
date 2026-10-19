'use strict';

/**
 * Apollo.io People Search client
 *
 * Targets owner-level contacts at small HVAC / plumbing / mechanical companies
 * in Southwest Michigan. Returns a normalized array of lead objects ready to
 * be written to the Google Sheet.
 *
 * Apollo API docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// ── Target cities ──────────────────────────────────────────────────────────
// Edit this array to add / remove cities at any time.
const TARGET_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// ── Decision-maker titles (priority order) ────────────────────────────────
// The first match found for a company is used. Apollo returns people ranked by
// title relevance so "Owner" contacts naturally surface first.
const PERSON_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'general manager',
];

// ── Industry keywords ──────────────────────────────────────────────────────
// Apollo will match these against organization name + industry tags.
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
];

/**
 * Format a raw phone string to (NXX) NXX-XXXX.
 * Returns the original string if it cannot be normalized.
 */
function formatPhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

/**
 * Extract the best available phone number from an Apollo contact record.
 * Priority: mobile > direct > first available > organization phone.
 */
function extractPhone(person) {
  if (person.mobile_phone) return formatPhone(person.mobile_phone);

  const numbers = person.phone_numbers || [];

  const mobile = numbers.find(n => n.type === 'mobile');
  if (mobile) return formatPhone(mobile.sanitized_number || mobile.raw_number);

  const direct = numbers.find(n => n.type === 'direct');
  if (direct) return formatPhone(direct.sanitized_number || direct.raw_number);

  if (numbers.length > 0) {
    return formatPhone(numbers[0].sanitized_number || numbers[0].raw_number);
  }

  // Fall back to organization's main number
  return formatPhone(person.organization?.phone || '');
}

/**
 * Map a raw Apollo person record to the flat lead shape used by sheets.js.
 */
function normalizeLead(person) {
  const org = person.organization || {};
  return {
    businessName: org.name || person.organization_name || '',
    ownerFirstName: person.first_name || '',
    ownerLastName: person.last_name || '',
    phone: extractPhone(person),
    city: person.city || org.city || '',
    website: org.website_url || person.website_url || '',
  };
}

/**
 * Search Apollo for HVAC decision-makers in SW Michigan.
 *
 * @param {number} fetchLimit  Maximum number of raw records to request before
 *                             de-duplication and the per-run cap are applied.
 * @returns {Promise<Array>}   Normalized lead objects (with a phone number).
 */
async function searchHvacLeads(fetchLimit = 50) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const allLeads = [];
  const seenOrgs = new Set();

  // Apollo per_page max is 100; we'll request in one shot (up to fetchLimit).
  const perPage = Math.min(fetchLimit, 100);

  const payload = {
    page: 1,
    per_page: perPage,
    person_titles: PERSON_TITLES,
    person_locations: TARGET_CITIES,
    organization_num_employees_ranges: ['1,25'],
    q_keywords: INDUSTRY_KEYWORDS.join(' OR '),
    // Only return contacts that Apollo has a phone number for
    contact_phone_numbers_quality: ['likely_to_connect', 'guessed'],
  };

  let response;
  try {
    response = await axios.post(
      `${APOLLO_BASE}/mixed_people/search`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
        },
        timeout: 30_000,
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    throw new Error(`Apollo API request failed (HTTP ${status}): ${detail}`);
  }

  const people = response.data?.people || response.data?.contacts || [];

  for (const person of people) {
    const lead = normalizeLead(person);

    // Skip if no phone number
    if (!lead.phone) continue;

    // Skip if no business name
    if (!lead.businessName) continue;

    // De-duplicate by organization within this batch
    const key = lead.businessName.toLowerCase().trim();
    if (seenOrgs.has(key)) continue;
    seenOrgs.add(key);

    allLeads.push(lead);
  }

  return allLeads;
}

/**
 * Smoke-test the Apollo connection by fetching a single result.
 * Throws on any error so the caller can surface it at startup.
 */
async function verifyApolloConnection() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in your .env file');

  await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    { page: 1, per_page: 1, person_titles: ['owner'], person_locations: [TARGET_CITIES[0]] },
    {
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      timeout: 15_000,
    }
  );
}

module.exports = { searchHvacLeads, verifyApolloConnection };
