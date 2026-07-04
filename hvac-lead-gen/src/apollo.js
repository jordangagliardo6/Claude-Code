'use strict';

const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/v1';

// Southwest Michigan cities — add or remove entries to change your target area
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Decision-maker titles in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// NAICS codes for HVAC / Plumbing / Mechanical Contracting
// 238220 = Plumbing, Heating, Air-Conditioning Contractors
// 811412 = Appliance Repair and Maintenance (covers HVAC service shops)
const HVAC_NAICS_CODES = ['238220', '238221', '238222', '81141', '811412'];

// SIC codes as a fallback filter layer
// 1711 = Plumbing, Heating, Air-Conditioning
// 7623 = Refrigeration & Air-Conditioning Service
const HVAC_SIC_CODES = ['1711', '7623'];

/**
 * Search Apollo for HVAC decision-makers in Southwest Michigan.
 * Returns raw Apollo "people" objects — phone numbers are NOT included here;
 * use enrichPerson() to reveal them.
 *
 * @param {number} maxResults - max records to request (Apollo caps at 100/page)
 * @param {number} page       - page number for pagination
 */
async function searchHVACLeads(maxResults = 25, page = 1) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment');

  const payload = {
    api_key: apiKey,
    per_page: Math.min(maxResults, 100),
    page,

    // Job titles — set include_similar_titles=false for exact matches only
    person_titles: TARGET_TITLES,
    include_similar_titles: false,

    // Company location filter (organization HQ, not person home address)
    organization_locations: SW_MICHIGAN_LOCATIONS,

    // 1–25 employees — owner-operated small businesses
    organization_num_employees_ranges: ['1,25'],

    // Industry codes
    organization_naics_codes: HVAC_NAICS_CODES,
    organization_sic_codes: HVAC_SIC_CODES,

    // Keyword boost to catch businesses Apollo didn't classify via codes
    q_organization_keyword_tags: [
      'hvac',
      'heating and cooling',
      'air conditioning',
      'plumbing',
      'mechanical contracting',
      'furnace repair',
    ],
  };

  const response = await axios.post(`${BASE_URL}/mixed_people/search`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });

  return response.data.people || [];
}

/**
 * Enrich a single person by Apollo ID to reveal their phone number.
 * Costs 1 Apollo credit per matched contact.
 * Apollo's phone enrichment is async — this function polls until resolved
 * or times out after ~30 seconds.
 *
 * @param {string} personId - Apollo person ID from searchHVACLeads()
 * @returns {object|null}   - enriched person object, or null if not found
 */
async function enrichPerson(personId) {
  const apiKey = process.env.APOLLO_API_KEY;

  const response = await axios.post(`${BASE_URL}/people/match`, {
    api_key: apiKey,
    id: personId,
    reveal_phone_number: true,
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });

  const person = response.data.person;
  if (!person) return null;

  // If phone enrichment is async, poll for the result
  const requestId = person.phone_enrichment?.request_id;
  if (requestId) {
    return pollPhoneEnrichment(apiKey, requestId, personId);
  }

  return person;
}

/**
 * Poll the async phone enrichment endpoint until resolved (max ~30s).
 */
async function pollPhoneEnrichment(apiKey, requestId, personId, attempts = 0) {
  if (attempts > 6) return null; // give up after ~30s

  await sleep(5_000);

  const response = await axios.get(`${BASE_URL}/people/phone_enrichment/${requestId}`, {
    params: { api_key: apiKey },
    timeout: 15_000,
  });

  const status = response.data?.status;
  if (status === 'complete') {
    // Re-fetch the fully enriched record
    const enriched = await axios.post(`${BASE_URL}/people/match`, {
      api_key: apiKey,
      id: personId,
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 });
    return enriched.data.person || null;
  }

  if (status === 'pending' || status === 'processing') {
    return pollPhoneEnrichment(apiKey, requestId, personId, attempts + 1);
  }

  return null;
}

/**
 * Extract the best available phone number from an enriched Apollo person.
 * Prefers direct/mobile numbers over company main lines.
 */
function extractPhone(person) {
  if (!person) return null;

  // Apollo returns sanitized_phone (best match) or an array of phone_numbers
  if (person.sanitized_phone) return person.sanitized_phone;

  const numbers = person.phone_numbers || [];
  // Prefer direct / mobile types
  const direct = numbers.find(n => ['direct', 'mobile', 'work_hq'].includes(n.type));
  if (direct) return direct.sanitized_number || direct.raw_number;

  if (numbers.length > 0) return numbers[0].sanitized_number || numbers[0].raw_number;

  return null;
}

/**
 * Map a raw Apollo person + enriched data into our canonical lead shape.
 * Returns null if there is no usable phone number (per the spec: skip no-phone contacts).
 */
function buildLead(searchPerson, enrichedPerson) {
  const phone = extractPhone(enrichedPerson || searchPerson);
  if (!phone) return null;

  const org = searchPerson.organization || {};

  return {
    businessName: org.name || searchPerson.organization_name || '',
    firstName: searchPerson.first_name || '',
    lastName: searchPerson.last_name || '',
    phone,
    city: extractCity(searchPerson, org),
    website: org.website_url || org.primary_domain || '',
  };
}

function extractCity(person, org) {
  // Apollo returns city on the person or on the organization
  if (org.city) return org.city;
  if (person.city) return person.city;

  // Fall back: parse from organization location string
  const loc = org.raw_address || '';
  const match = loc.match(/^([^,]+)/);
  return match ? match[1].trim() : '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchHVACLeads, enrichPerson, buildLead };
