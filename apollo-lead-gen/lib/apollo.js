'use strict';

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const APOLLO_BASE = 'https://api.apollo.io/v1';

// SW Michigan cities to target — edit this list to add/remove cities
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
  // Surrounding areas for broader coverage
  'Stevensville, Michigan, United States',
  'Coloma, Michigan, United States',
  'Paw Paw, Michigan, United States',
  'Mattawan, Michigan, United States',
  'Three Rivers, Michigan, United States',
];

// Job titles to target, in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industry keywords Apollo uses to tag companies
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Heating Cooling',
  'Air Conditioning',
];

// Apollo NAICS codes for HVAC/mechanical contracting
// 2382 = Plumbing, Heating, and Air-Conditioning Contractors
const HVAC_NAICS = ['2382'];

/**
 * Calls the Apollo people search API.
 * Returns raw Apollo person records (no phone numbers yet — enrichment needed).
 */
async function searchPeople(apiKey, fetchLimit) {
  const body = {
    api_key: apiKey,
    page: 1,
    per_page: Math.min(fetchLimit, 100),
    person_titles: TARGET_TITLES,
    // Search both where the person lives AND where company is headquartered
    person_locations: SW_MICHIGAN_LOCATIONS,
    organization_locations: SW_MICHIGAN_LOCATIONS,
    organization_num_employees_ranges: ['1,25'],
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    organization_naics_codes: HVAC_NAICS,
    // Seniority narrows to decision-makers
    person_seniorities: ['owner', 'founder', 'c_suite'],
    // Strict title match — no "similar" expansion
    include_similar_titles: false,
  };

  const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Apollo search failed (${res.status}): ${errText}`);
  }

  const data = await res.json();

  if (data.error || data.error_code) {
    throw new Error(`Apollo API error: ${data.error || data.error_code}`);
  }

  return data.people || [];
}

/**
 * Enriches a batch of people to reveal phone numbers.
 * Apollo's bulk_match endpoint costs 1 credit per person.
 * Only call this for net-new leads (after dedup) to conserve credits.
 *
 * @param {string} apiKey
 * @param {Array} people - raw people from searchPeople()
 * @returns {Array} enriched people with phone numbers
 */
async function enrichLeads(apiKey, people) {
  if (people.length === 0) return [];

  // Build match inputs from search results
  const details = people.map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    organization_name: p.organization?.name,
    domain: p.organization?.primary_domain,
  }));

  const body = {
    api_key: apiKey,
    details,
    reveal_personal_emails: false, // not needed
    reveal_phone_number: true,
  };

  const res = await fetch(`${APOLLO_BASE}/people/bulk_match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Apollo enrichment failed (${res.status}): ${errText}`);
  }

  const data = await res.json();

  if (data.error || data.error_code) {
    throw new Error(`Apollo enrichment error: ${data.error || data.error_code}`);
  }

  return data.matches || [];
}

/**
 * Pick the best phone number from an enriched person record.
 * Priority: mobile > direct > any phone.
 */
function getBestPhone(person) {
  const phones = person.phone_numbers || [];

  const mobile = phones.find((p) => p.type === 'mobile' || p.type === 'cell');
  if (mobile) return mobile.sanitized_number || mobile.raw_number;

  const direct = phones.find((p) => p.type === 'direct');
  if (direct) return direct.sanitized_number || direct.raw_number;

  if (phones.length > 0) return phones[0].sanitized_number || phones[0].raw_number;

  // Some enriched records store the primary phone at the top level
  return person.phone || null;
}

/**
 * Main export: search Apollo for HVAC leads, enrich for phone numbers,
 * return only contacts that have a usable phone number.
 *
 * @param {number} fetchLimit - how many candidates to pull from Apollo search
 * @returns {Array<{businessName, firstName, lastName, phone, city, website}>}
 */
async function searchApolloLeads(fetchLimit) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  console.log(`  Searching Apollo for up to ${fetchLimit} SW Michigan HVAC contacts...`);
  const rawPeople = await searchPeople(apiKey, fetchLimit);
  console.log(`  Apollo search returned ${rawPeople.length} raw results`);

  if (rawPeople.length === 0) return [];

  console.log(`  Enriching ${rawPeople.length} contacts to reveal phone numbers...`);
  const enriched = await enrichLeads(apiKey, rawPeople);

  // Map enriched records to clean lead objects
  const leads = enriched
    .map((person) => {
      const phone = getBestPhone(person);
      return {
        businessName: person.organization?.name || '',
        firstName: person.first_name || '',
        lastName: person.last_name || '',
        phone: phone || '',
        // City from person location; fall back to org city
        city:
          person.city ||
          person.organization?.city ||
          '',
        website: person.organization?.website_url || person.organization?.primary_domain || '',
      };
    })
    // Must have both a business name and a phone number
    .filter((lead) => lead.businessName && lead.phone);

  console.log(`  ${leads.length} contacts have usable phone numbers after enrichment`);
  return leads;
}

module.exports = { searchApolloLeads };
