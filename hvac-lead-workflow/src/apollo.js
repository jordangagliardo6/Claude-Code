/**
 * Apollo.io REST API client for HVAC lead prospecting.
 *
 * Uses the v1 mixed_people/search endpoint which requires a paid Apollo plan
 * (Basic $49/mo or higher) for phone number + owner data.
 * Free accounts will receive an empty phone_numbers array.
 */

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// Southwest Michigan target cities and surrounding zip codes
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
  'Stevensville, Michigan',
  'Watervliet, Michigan',
  'Coloma, Michigan',
  'Paw Paw, Michigan',
  'Lawton, Michigan',
  'Three Rivers, Michigan',
  'Portage, Michigan',
  'Mattawan, Michigan',
];

// Job titles in priority order
const TARGET_TITLES = ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'];

// HVAC/plumbing/mechanical industry keywords
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating cooling',
  'air conditioning',
];

// NAICS 238220 = Plumbing, Heating, Air-Conditioning Contractors
// SIC  1711    = Plumbing, Heating, Air-Conditioning
const NAICS_CODES = ['23822'];
const SIC_CODES = ['1711', '1731'];

/**
 * Search Apollo People API for HVAC owners in SW Michigan.
 * Returns raw Apollo people records.
 *
 * @param {string} apiKey
 * @param {number} perPage  Max results (1–100). Defaults to 25.
 * @param {number} page     Page number for pagination. Defaults to 1.
 */
async function searchHvacLeads(apiKey, perPage = 25, page = 1) {
  const payload = {
    per_page: perPage,
    page,
    person_titles: TARGET_TITLES,
    include_similar_titles: false,
    person_locations: SW_MICHIGAN_CITIES,
    organization_locations: ['Michigan, United States'],
    organization_num_employees_ranges: ['1,10', '11,25'],
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    organization_naics_codes: NAICS_CODES,
    organization_sic_codes: SIC_CODES,
    // Only return contacts that have at least one phone number
    contact_email_status: undefined,
  };

  const response = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'Cache-Control': 'no-cache',
      },
      timeout: 30000,
    }
  );

  return response.data;
}

/**
 * Normalize a raw Apollo person record into the sheet row shape.
 * Returns null if the record has no usable phone number.
 *
 * @param {object} person  Raw Apollo person record
 * @returns {{ businessName, ownerFirstName, ownerLastName, phone, city, website } | null}
 */
function normalizePerson(person) {
  // Prefer direct/mobile numbers; fall back to any number
  const phones = person.phone_numbers || [];
  const mobileOrDirect = phones.find(
    (p) => p.type === 'mobile' || p.type === 'direct_phone'
  );
  const anyPhone = phones[0];
  const phoneEntry = mobileOrDirect || anyPhone;

  if (!phoneEntry || !phoneEntry.sanitized_number) {
    return null; // Skip — no phone available
  }

  const org = person.organization || {};
  const city =
    person.city ||
    org.city ||
    (person.present_raw_address || '').split(',')[0]?.trim() ||
    '';

  // Format phone as (XXX) XXX-XXXX
  const raw = phoneEntry.sanitized_number.replace(/\D/g, '');
  const phone =
    raw.length === 10
      ? `(${raw.slice(0, 3)}) ${raw.slice(3, 6)}-${raw.slice(6)}`
      : raw.length === 11 && raw[0] === '1'
      ? `(${raw.slice(1, 4)}) ${raw.slice(4, 7)}-${raw.slice(7)}`
      : phoneEntry.sanitized_number;

  return {
    businessName: org.name || person.organization_name || '',
    ownerFirstName: person.first_name || '',
    ownerLastName: person.last_name || '',
    phone,
    city,
    website: org.website_url || org.primary_domain || '',
  };
}

module.exports = { searchHvacLeads, normalizePerson, SW_MICHIGAN_CITIES };
