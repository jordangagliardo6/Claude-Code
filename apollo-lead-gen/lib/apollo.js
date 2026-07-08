/**
 * apollo.js — Apollo.io REST API integration
 *
 * Flow:
 *   1. searchLeads()   → finds people matching title/industry/location (no phone yet)
 *   2. enrichContact() → calls People Match with reveal_phone_number:true (costs credits)
 *   3. extractBestPhone() → picks mobile > direct > any from the enriched record
 *
 * Apollo plan note:
 *   Free plan = 50 enrichments/month.
 *   Basic ($49/mo) = 1,000/month → enough for 25/day × 31 days = 775/month.
 */

'use strict';

const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/api/v1';

// ─── Targeting config ─────────────────────────────────────────────────────────

// Edit this list to add/remove cities. Apollo matches on city + state + country.
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Fallback: use if city-level filtering returns too few results.
// const SW_MICHIGAN_LOCATIONS = ['Michigan, United States'];

// SIC codes that cover HVAC / plumbing / mechanical contracting.
const INDUSTRY_SIC_CODES = [
  '1711', // Plumbing, Heating, Air-Conditioning (primary)
  '7623', // Refrigeration & AC Service/Repair
  '5074', // Plumbing & Heating Equipment (wholesale)
  '5075', // Warm Air Heating & AC Equipment (wholesale)
];

// NAICS codes as a second net.
const INDUSTRY_NAICS_CODES = [
  '23822',  // Plumbing, Heating, AC Contractors (5-digit prefix)
  '238220', // Same, 6-digit exact
];

// Keyword tags applied to the ORGANIZATION (not the person).
// Add/remove to widen or narrow industry scope.
const INDUSTRY_KEYWORD_TAGS = [
  'HVAC',
  'heating',
  'air conditioning',
  'plumbing',
  'mechanical contracting',
];

// Job titles in priority order. include_similar_titles:false enforces strict matching.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ─── API helpers ──────────────────────────────────────────────────────────────

function apolloHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Api-Key': process.env.APOLLO_API_KEY,
  };
}

/**
 * Search Apollo for people matching our criteria.
 * Returns raw Apollo people objects (NO phone numbers — need enrichment).
 *
 * @param {number} perPage - How many results to request (fetch extra to offset
 *                           contacts that won't have phones after enrichment).
 * @param {number} page    - Page number (1-indexed).
 */
async function searchLeads(perPage = 75, page = 1) {
  const body = {
    person_titles: TARGET_TITLES,
    include_similar_titles: false,   // strict: no "co-owner", "vp operations", etc.
    person_seniorities: ['owner', 'c_suite'],
    organization_locations: SW_MICHIGAN_LOCATIONS,
    organization_num_employees_ranges: ['1,25'],
    organization_sic_codes: INDUSTRY_SIC_CODES,
    organization_naics_codes: INDUSTRY_NAICS_CODES,
    q_organization_keyword_tags: INDUSTRY_KEYWORD_TAGS,
    per_page: perPage,
    page,
  };

  const { data } = await axios.post(`${BASE_URL}/mixed_people/search`, body, {
    headers: apolloHeaders(),
  });

  return data.people || [];
}

/**
 * Enrich a single Apollo contact by their Apollo ID to retrieve phone numbers.
 * This call COSTS one enrichment credit on your Apollo plan.
 *
 * @param {string} personId - Apollo's internal person ID from searchLeads().
 * @returns {object|null}   - Enriched person object, or null on failure.
 */
async function enrichContact(personId) {
  try {
    const { data } = await axios.post(
      `${BASE_URL}/people/match`,
      {
        id: personId,
        reveal_personal_emails: false,
        reveal_phone_number: true,
      },
      { headers: apolloHeaders() }
    );
    return data.person || null;
  } catch (err) {
    // Non-fatal: log and return null so the caller can skip this contact.
    const status = err.response?.status;
    const msg    = err.response?.data?.error || err.message;
    console.warn(`  [apollo] enrichment failed for ${personId} (HTTP ${status}): ${msg}`);
    return null;
  }
}

/**
 * Pick the best available phone number from an enriched person object.
 * Priority: mobile_phone → type:"mobile" → type:"direct" → first available.
 *
 * @param {object} person - Enriched person from enrichContact().
 * @returns {string|null}
 */
function extractBestPhone(person) {
  if (!person) return null;

  // Top-level mobile_phone field (Apollo's shortcut for mobile numbers)
  if (person.mobile_phone) return person.mobile_phone;

  const numbers = person.phone_numbers || [];

  const mobile = numbers.find(p => p.type === 'mobile');
  if (mobile) return mobile.sanitized_number || mobile.raw_number;

  const direct = numbers.find(p => p.type === 'direct');
  if (direct) return direct.sanitized_number || direct.raw_number;

  if (numbers.length > 0) {
    return numbers[0].sanitized_number || numbers[0].raw_number || null;
  }

  return null;
}

/**
 * Extract the city name from an enriched person object.
 * Prefers the organization city; falls back to the person's location city.
 */
function extractCity(person) {
  return (
    person.organization?.city ||
    person.city ||
    ''
  );
}

module.exports = {
  searchLeads,
  enrichContact,
  extractBestPhone,
  extractCity,
  SW_MICHIGAN_LOCATIONS, // exported so setup.js can display them
};
