'use strict';

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// SW Michigan target cities — add or remove cities here to change coverage
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
  // Surrounding / adjacent areas
  'Stevensville, Michigan',
  'Berrien Springs, Michigan',
  'Portage, Michigan',
  'Allegan, Michigan',
  'Zeeland, Michigan',
  'Jenison, Michigan',
  'Coloma, Michigan',
];

// Job titles to target, in priority order (Owner first)
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// SIC 1711 = Plumbing, Heating, and Air-Conditioning Contractors
// This catches HVAC, plumbers, and mechanical contractors in one code
const TARGET_SIC_CODES = ['1711'];

// Keyword tags supplement SIC — helps catch companies Apollo didn't SIC-classify
const TARGET_KEYWORD_TAGS = [
  'hvac',
  'heating',
  'air conditioning',
  'cooling',
  'plumbing',
  'mechanical contracting',
  'refrigeration',
];

/**
 * Search Apollo for HVAC/plumbing business owners in SW Michigan.
 *
 * Apollo's People Search requires a paid plan (Basic $49/mo or higher).
 * Returns raw people objects — phone numbers are populated after enrichment.
 *
 * @param {object} opts
 * @param {number} opts.page   - Page number (1-indexed)
 * @param {number} opts.perPage - Results per page (max 100)
 * @returns {Promise<{ people: object[], pagination: object }>}
 */
async function searchHVACLeads({ page = 1, perPage = 100 } = {}) {
  const response = await axios.post(
    `${APOLLO_BASE}/mixed_people/api_search`,
    {
      api_key: process.env.APOLLO_API_KEY,
      page,
      per_page: perPage,
      person_titles: TARGET_TITLES,
      include_similar_titles: true,         // catches "co-owner", "proprietor", etc.
      organization_locations: SW_MICHIGAN_LOCATIONS,
      organization_num_employees_ranges: ['1,10', '11,25'],
      organization_sic_codes: TARGET_SIC_CODES,
      // Keyword tags run in addition to SIC to widen the net slightly
      q_organization_keyword_tags: TARGET_KEYWORD_TAGS,
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  return response.data;
}

/**
 * Enrich a batch of people (by Apollo ID) to reveal phone numbers.
 *
 * Apollo bulk_match accepts up to 10 people per call, so this function
 * automatically batches larger arrays and combines the results.
 *
 * @param {string[]} apolloIds - Array of Apollo person IDs from the search step
 * @returns {Promise<object[]>} - Enriched person objects (phone_numbers populated)
 */
async function enrichWithPhones(apolloIds) {
  const BATCH_SIZE = 10;
  const enriched = [];

  for (let i = 0; i < apolloIds.length; i += BATCH_SIZE) {
    const batch = apolloIds.slice(i, i + BATCH_SIZE);
    const details = batch.map(id => ({ id }));

    const response = await axios.post(
      `${APOLLO_BASE}/people/bulk_match`,
      {
        api_key: process.env.APOLLO_API_KEY,
        details,
        reveal_phone_number: true,
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const people = response.data.people || [];
    enriched.push(...people);

    // Respect Apollo rate limits between batches
    if (i + BATCH_SIZE < apolloIds.length) {
      await sleep(800);
    }
  }

  return enriched;
}

/**
 * Pick the best phone number from a person's phone_numbers array.
 * Priority: mobile > direct > first available
 *
 * @param {object[]} phoneNumbers - Array from Apollo enrichment response
 * @returns {string} - E.164 formatted number, or empty string if none
 */
function pickBestPhone(phoneNumbers = []) {
  if (!phoneNumbers.length) return '';

  const mobile = phoneNumbers.find(p => p.type === 'mobile');
  if (mobile) return mobile.sanitized_number || mobile.raw_number || '';

  const direct = phoneNumbers.find(p => p.type === 'direct');
  if (direct) return direct.sanitized_number || direct.raw_number || '';

  const first = phoneNumbers[0];
  return first.sanitized_number || first.raw_number || '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchHVACLeads, enrichWithPhones, pickBestPhone };
