/**
 * Apollo.io API integration for HVAC lead prospecting.
 *
 * Flow:
 *  1. Search the People API for HVAC owners in SW Michigan (returns IDs, no phones)
 *  2. Bulk-enrich each batch to pull phone numbers
 *  3. Return only contacts that have at least one phone number
 *
 * Apollo plan requirements:
 *  - People API Search  → Basic plan ($49/mo) or higher
 *  - Phone enrichment   → credits consumed per reveal; confirm balance before large runs
 */

const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/api/v1';

// Southwest Michigan cities + common nearby municipalities
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
  'Stevensville, Michigan',
  'Berrien Springs, Michigan',
  'Coloma, Michigan',
  'Watervliet, Michigan',
  'Paw Paw, Michigan',
  'Dowagiac, Michigan',
  'Three Rivers, Michigan',
  'Plainwell, Michigan',
  'Allegan, Michigan',
  'Zeeland, Michigan',
  'Fennville, Michigan',
  'Bridgman, Michigan',
  'Buchanan, Michigan',
];

// Decision-maker titles in priority order (Apollo will match similar titles too)
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// SIC codes: 1711 = Plumbing/Heating/AC, 7623 = Refrigeration/AC Repair, 1731 = Electrical/Mechanical
const HVAC_SIC_CODES = ['1711', '7623', '1731'];

/**
 * Search Apollo People API for HVAC owners in SW Michigan.
 * Returns raw Apollo person objects (no phone numbers yet).
 *
 * @param {string} apiKey  APOLLO_API_KEY env value
 * @param {number} limit   Max results to fetch (≤ 100 per page)
 * @returns {Promise<Array>} Array of raw Apollo person objects
 */
async function searchHvacOwners(apiKey, limit = 25) {
  const payload = {
    api_key: apiKey,
    per_page: Math.min(limit, 100),
    page: 1,
    // Only people whose employer has 1–25 employees (owner-operated)
    organization_num_employees_ranges: ['1,10', '11,25'],
    // HVAC, Plumbing, Mechanical SIC codes
    organization_sic_codes: HVAC_SIC_CODES,
    // Person must be located in SW Michigan
    person_locations: SW_MICHIGAN_CITIES,
    // Decision-maker titles — Apollo also returns "similar" titles by default
    person_titles: TARGET_TITLES,
    include_similar_titles: true,
  };

  const response = await axios.post(
    `${BASE_URL}/mixed_people/api_search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    }
  );

  const people = response.data?.people ?? [];
  console.log(`[Apollo] People search returned ${people.length} results`);
  return people;
}

/**
 * Enrich a batch of Apollo person records to reveal phone numbers.
 * Sends one enrichment request per person — filters to those with phones.
 *
 * NOTE: Phone reveals consume Apollo credits. The free plan does NOT include
 * phone enrichment; Basic plan includes a credit allowance per month.
 *
 * @param {string}  apiKey  APOLLO_API_KEY
 * @param {Array}   people  Raw person objects from searchHvacOwners()
 * @returns {Promise<Array>} People with at least one phone number populated
 */
async function enrichWithPhones(apiKey, people) {
  const enriched = [];

  for (const person of people) {
    try {
      const response = await axios.post(
        `${BASE_URL}/people/match`,
        {
          api_key: apiKey,
          id: person.id,
          reveal_phone_number: true,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 20_000,
        }
      );

      const match = response.data?.person;
      if (!match) continue;

      // Collect phone numbers from all available fields
      const phones = [
        ...(match.phone_numbers ?? []).map((p) => p.sanitized_number),
        match.mobile_phone,
        match.direct_phone,
        match.work_direct_phone,
        match.sanitized_phone,
      ].filter(Boolean);

      if (phones.length === 0) continue; // skip — no phone found

      enriched.push({
        firstName: match.first_name ?? '',
        lastName: match.last_name ?? '',
        phone: phones[0], // prefer the first phone returned
        companyName:
          match.organization?.name ??
          match.employment_history?.[0]?.organization_name ??
          '',
        city:
          match.city ?? match.organization?.city ?? '',
        website:
          match.organization?.website_url ??
          match.organization?.primary_domain
            ? `https://${match.organization.primary_domain}`
            : '',
      });

      // Polite delay between enrichment calls to respect Apollo rate limits
      await sleep(500);
    } catch (err) {
      console.warn(
        `[Apollo] Enrichment failed for person ${person.id}: ${err.message}`
      );
    }
  }

  console.log(
    `[Apollo] ${enriched.length} of ${people.length} people have phone numbers`
  );
  return enriched;
}

/**
 * Main entry point: search + enrich → return lead objects ready for the sheet.
 *
 * @param {string} apiKey   APOLLO_API_KEY
 * @param {number} maxLeads Maximum leads to return
 * @returns {Promise<Array<{firstName,lastName,phone,companyName,city,website}>>}
 */
async function fetchLeads(apiKey, maxLeads = 25) {
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set');

  const rawPeople = await searchHvacOwners(apiKey, maxLeads * 2); // fetch extra to account for phone-less results
  if (rawPeople.length === 0) {
    console.log('[Apollo] No results returned from People search');
    return [];
  }

  const leads = await enrichWithPhones(apiKey, rawPeople);
  return leads.slice(0, maxLeads);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { fetchLeads };
