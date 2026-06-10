/**
 * apollo.js — Apollo.io REST API client
 *
 * Searches for HVAC decision-makers in Southwest Michigan and maps results
 * to the lead shape used by the rest of the workflow.
 *
 * Apollo API docs: https://developer.apollo.io/
 */

'use strict';

const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/api/v1';

// ─── Configurable target data ─────────────────────────────────────────────────
// Edit these arrays to change cities, titles, or industries without touching
// any other file.

const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
  // Slightly broader fallback so Apollo can find companies that list county/region
  'Southwest Michigan, United States',
  'Berrien County, Michigan, United States',
  'Allegan County, Michigan, United States',
  'Ottawa County, Michigan, United States',
  'Muskegon County, Michigan, United States',
];

// Priority order matters: we sort results by this list before writing to Sheets
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Apollo keyword tags used to match HVAC industry companies
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and cooling',
  'heating and air conditioning',
  'air conditioning',
  'plumbing',
  'mechanical contracting',
  'refrigeration',
  'furnace',
  'boiler',
];

// SIC 1711 = Plumbing, Heating, Air-Conditioning Contractors
// Providing this improves precision when Apollo has SIC data for a company.
const INDUSTRY_SIC_CODES = ['1711'];

// NAICS 238220 = Plumbing, Heating, and Air-Conditioning Contractors
const INDUSTRY_NAICS_CODES = ['238220', '23822'];

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC decision-makers in SW Michigan.
 *
 * Apollo's People Search does not bill credits per call; it returns masked or
 * partial phone data. Use enrichPersonPhone() to reveal actual numbers (costs
 * 1 credit per match) — controlled by ENABLE_ENRICHMENT env var.
 *
 * @param {number} page     – 1-indexed page number
 * @param {number} perPage  – results per page (max 100; Apollo display limit 50 000 total)
 * @returns {Promise<{ people: object[], pagination: object }>}
 */
async function searchHVACLeads(page = 1, perPage = 100) {
  const body = {
    api_key: process.env.APOLLO_API_KEY,

    // Titles — Apollo will also match "similar" titles unless include_similar_titles=false
    person_titles: TARGET_TITLES,

    // Organization HQ location — we cast a wide net over SW Michigan cities
    organization_locations: SW_MICHIGAN_LOCATIONS,

    // 1–25 employees only (owner-operated small businesses)
    organization_num_employees_ranges: ['1,10', '11,25'],

    // HVAC keyword tags on the org
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,

    // SIC + NAICS narrow the industry further when available
    organization_sic_codes: INDUSTRY_SIC_CODES,
    organization_naics_codes: INDUSTRY_NAICS_CODES,

    // Only request contacts Apollo believes have a phone on file
    // (the actual number may still be masked without enrichment)
    contact_phone_status: ['verified', 'unverified'],

    page,
    per_page: perPage,
  };

  const response = await axios.post(
    `${BASE_URL}/mixed_people/search`,
    body,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    }
  );

  return response.data;
}

// ─── Enrichment (costs credits) ───────────────────────────────────────────────

/**
 * Call Apollo's /people/match endpoint to reveal a contact's phone number.
 * Costs exactly 1 Apollo credit per successful match.
 *
 * Only called when ENABLE_ENRICHMENT=true and the search result has no phone.
 *
 * @param {object} person  – person object from searchHVACLeads()
 * @returns {Promise<object|null>}
 */
async function enrichPersonPhone(person) {
  const body = {
    api_key: process.env.APOLLO_API_KEY,
    first_name: person.first_name,
    last_name: person.last_name,
    organization_name: person.organization?.name,
    domain: person.organization?.website_url
      ? stripProtocol(person.organization.website_url)
      : undefined,
    reveal_phone_number: true,
  };

  const response = await axios.post(
    `${BASE_URL}/people/match`,
    body,
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    }
  );

  return response.data?.person ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the best available phone number from an Apollo person object.
 * Prefers mobile → direct → any.
 */
function extractPhone(person) {
  if (Array.isArray(person?.phone_numbers) && person.phone_numbers.length > 0) {
    const order = ['mobile', 'direct'];
    for (const type of order) {
      const match = person.phone_numbers.find(p => p.type === type);
      if (match?.sanitized_number) return match.sanitized_number;
    }
    // Fall back to first available
    const first = person.phone_numbers[0];
    if (first?.sanitized_number) return first.sanitized_number;
    if (first?.raw_number) return first.raw_number;
  }

  // Some Apollo responses surface the number at the top level
  if (person?.sanitized_phone) return person.sanitized_phone;
  if (person?.phone) return person.phone;

  return null;
}

/**
 * Map an Apollo person+organization object to the internal lead shape.
 *
 * @returns {{ businessName, firstName, lastName, phone, city, website, titleRank }}
 */
function mapToLead(person) {
  const phone = extractPhone(person);
  const title = person.title || '';
  const titleRank = rankTitle(title);

  return {
    businessName: (person.organization?.name || '').trim(),
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone: phone || '',
    city: (person.city || person.organization?.city || '').trim(),
    website: (person.organization?.website_url || '').trim(),
    titleRank,
    hasPhone: !!phone,
  };
}

/**
 * Returns a sort index for a title (lower = higher priority).
 * Titles not in TARGET_TITLES get rank 99.
 */
function rankTitle(title) {
  const normalized = title.toLowerCase();
  for (let i = 0; i < TARGET_TITLES.length; i++) {
    if (normalized.includes(TARGET_TITLES[i].toLowerCase())) return i;
  }
  return 99;
}

function stripProtocol(url) {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

module.exports = {
  searchHVACLeads,
  enrichPersonPhone,
  extractPhone,
  mapToLead,
  SW_MICHIGAN_LOCATIONS,
  TARGET_TITLES,
  INDUSTRY_KEYWORDS,
};
