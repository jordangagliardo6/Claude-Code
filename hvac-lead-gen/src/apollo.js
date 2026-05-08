'use strict';

require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

const BASE_URL = 'https://api.apollo.io/v1';

// ── Configurable filters ────────────────────────────────────────────────────
// Add or remove cities here as your territory changes.
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Industry keywords matched against Apollo's organization keyword tags.
// Add / remove terms if you want to widen or narrow the industry scope.
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating',
  'air conditioning',
  'plumbing',
  'mechanical contractor',
  'heating and cooling',
  'furnace',
  'ductwork',
  'boiler',
];

// Decision-maker titles listed in priority order.
// Apollo returns results that match ANY of these titles.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Search Apollo.io for HVAC decision-makers in Southwest Michigan.
 * Returns an array of normalized lead objects, each guaranteed to have a phone.
 *
 * @param {number} maxResults - Maximum leads to return (default 25)
 * @returns {Promise<Array>}
 */
async function searchHVACLeads(maxResults = 25) {
  ensureApiKey();

  logger.log(`Searching Apollo.io for HVAC leads in Southwest Michigan (max ${maxResults})...`);

  const payload = {
    api_key: process.env.APOLLO_API_KEY,
    page: 1,
    per_page: Math.min(maxResults * 2, 100), // fetch extra so we have room to filter no-phone records
    person_titles: TARGET_TITLES,
    person_locations: SW_MICHIGAN_LOCATIONS,
    organization_locations: ['Michigan, United States'],
    // "1,25" means 1–25 employees — change the upper bound here if needed
    organization_num_employees_ranges: ['1,25'],
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    // Include all email statuses so we don't lose records that only have phones
    contact_email_status_v2: [
      'verified',
      'unverified',
      'likely to engage',
      'unavailable',
    ],
  };

  let response;
  try {
    response = await axios.post(`${BASE_URL}/mixed_people/search`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    });
  } catch (err) {
    throw buildApiError(err);
  }

  const { people = [], pagination = {} } = response.data;

  if (people.length === 0) {
    logger.warn('Apollo.io returned 0 contacts for the current search criteria.');
    return [];
  }

  logger.log(
    `Apollo returned ${people.length} contacts ` +
    `(${pagination.total_entries ?? '?'} total available across all pages).`
  );

  const leads = people
    .map(normalizePerson)
    .filter(Boolean); // normalizePerson returns null when no phone found

  logger.log(`${leads.length} leads have a usable phone number after filtering.`);

  return leads.slice(0, maxResults);
}

/**
 * Verify the API key is valid by hitting a lightweight endpoint.
 * Throws if the key is missing or rejected.
 */
async function testConnection() {
  ensureApiKey();

  // A minimal 1-result search is the most reliable connectivity check.
  try {
    const response = await axios.post(
      `${BASE_URL}/mixed_people/search`,
      {
        api_key: process.env.APOLLO_API_KEY,
        page: 1,
        per_page: 1,
        person_locations: ['Michigan, United States'],
      },
      {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        timeout: 15_000,
      }
    );
    const total = response.data?.pagination?.total_entries ?? 0;
    return { success: true, message: `Connected. Apollo has ~${total} records matching a broad Michigan search.` };
  } catch (err) {
    throw buildApiError(err);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureApiKey() {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }
}

/**
 * Extract the best available phone number from a person record.
 * Priority: direct dial > mobile > first listed number.
 */
function pickPhone(person) {
  if (person.direct_dial_phone?.sanitized_number) {
    return person.direct_dial_phone.sanitized_number;
  }

  const phones = person.phone_numbers ?? [];
  if (phones.length === 0) return null;

  const mobile = phones.find(p => p.type === 'mobile');
  if (mobile) return mobile.sanitized_number || mobile.raw_number || null;

  const direct = phones.find(p => p.type === 'direct');
  if (direct) return direct.sanitized_number || direct.raw_number || null;

  return phones[0].sanitized_number || phones[0].raw_number || null;
}

/**
 * Normalize a raw Apollo person object into a flat lead record.
 * Returns null if no phone number is available (those leads are excluded).
 */
function normalizePerson(person) {
  const phone = pickPhone(person);
  if (!phone) return null;

  const org = person.organization ?? {};

  return {
    businessName: org.name || person.company_name || '',
    firstName:    person.first_name || '',
    lastName:     person.last_name  || '',
    phone,
    city:    person.city || (person.location ?? '').split(',')[0].trim() || org.city || '',
    website: org.website_url || '',
  };
}

function buildApiError(err) {
  if (err.response) {
    const status = err.response.status;
    const msg = err.response.data?.message
      || err.response.data?.error
      || err.response.statusText;
    return new Error(`Apollo API error (HTTP ${status}): ${msg}`);
  }
  if (err.request) {
    return new Error(`Apollo API did not respond (timeout or network error): ${err.message}`);
  }
  return err;
}

module.exports = { searchHVACLeads, testConnection, SW_MICHIGAN_LOCATIONS, TARGET_TITLES };
