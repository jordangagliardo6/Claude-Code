/**
 * Apollo.io API client for HVAC lead searches in Southwest Michigan.
 *
 * Uses the People Search endpoint to find owner-operated HVAC businesses.
 * API docs: https://apolloio.github.io/apollo-api-docs/?shell#people-search
 */

const axios = require('axios');

const APOLLO_API_BASE = 'https://api.apollo.io/v1';

// Southwest Michigan cities to target — edit this list to expand coverage
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Job titles to target, in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industry keywords for Apollo's keyword search
const INDUSTRY_KEYWORDS = 'HVAC heating air conditioning plumbing mechanical contracting';

/**
 * Search Apollo.io for HVAC contacts in Southwest Michigan.
 *
 * @param {string} apiKey - Apollo API key
 * @param {number} maxLeads - Maximum number of leads to return
 * @param {number} page - Page number for pagination (1-indexed)
 * @returns {Promise<Array>} Array of normalized contact objects
 */
async function searchHvacLeads(apiKey, maxLeads = 25, page = 1) {
  const payload = {
    api_key: apiKey,
    q_keywords: INDUSTRY_KEYWORDS,
    // Target owner-level titles — Apollo matches these as substrings, so "Owner" matches "Co-Owner"
    person_titles: TARGET_TITLES,
    // Company location filter — searches org headquarters, not person address
    q_organization_locations: SW_MICHIGAN_LOCATIONS,
    // 1–25 employees = owner-operated small businesses
    organization_num_employees_ranges: ['1,25'],
    // Only return people with at least one phone number
    has_phone: true,
    page,
    per_page: maxLeads,
  };

  const response = await axios.post(
    `${APOLLO_API_BASE}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30000,
    }
  );

  const { people = [], pagination = {} } = response.data;

  return {
    contacts: people.map(normalizeContact).filter(hasPhone),
    totalResults: pagination.total_entries || people.length,
  };
}

/**
 * Normalize a raw Apollo person record into a flat contact object.
 * Picks the best available phone number (mobile > direct > any).
 */
function normalizeContact(person) {
  const phones = person.phone_numbers || [];

  // Priority: mobile phone, then work direct, then any available
  const mobile = phones.find((p) => p.type === 'mobile_phone');
  const direct = phones.find((p) => p.type === 'work_direct_phone');
  const anyPhone = phones[0];

  const bestPhone = mobile || direct || anyPhone;

  const org = person.organization || {};

  // Extract city from person's address or org's location
  const city =
    person.city ||
    extractCity(person.present_raw_address) ||
    org.city ||
    '';

  return {
    businessName: org.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: bestPhone ? formatPhone(bestPhone.raw_number) : '',
    city,
    website: org.website_url || org.primary_domain || '',
    jobTitle: person.title || '',
  };
}

/**
 * Returns true if the contact has a usable phone number.
 */
function hasPhone(contact) {
  return contact.phone.length > 0;
}

/**
 * Extract city from a raw address string like "123 Main St, Kalamazoo, MI 49001".
 */
function extractCity(rawAddress) {
  if (!rawAddress) return '';
  const parts = rawAddress.split(',');
  // City is usually the second-to-last segment before the state/zip
  if (parts.length >= 2) {
    return parts[parts.length - 2].trim();
  }
  return '';
}

/**
 * Lightly format a phone number string for readability.
 * Strips everything but digits, then formats as (XXX) XXX-XXXX for US numbers.
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
  return raw; // Return original if not a standard US number
}

module.exports = { searchHvacLeads, SW_MICHIGAN_LOCATIONS, TARGET_TITLES };
