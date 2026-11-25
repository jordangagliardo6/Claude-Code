/**
 * Apollo.io People Search — HVAC leads in Southwest Michigan
 *
 * Uses the v1 mixed_people/search endpoint which returns contacts WITH
 * their associated organization data in a single call.
 *
 * API key is passed in the JSON body (Apollo also accepts it as a header
 * but body auth is more reliable across API versions).
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// Southwest Michigan cities — add or remove as needed
const SW_MICHIGAN_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
  'Portage',
  'Stevensville',
  'Coloma',
  'Watervliet',
  'Paw Paw',
  'Hartford',
  'Bridgman',
  'Fennville',
  'Saugatuck',
  'Douglas',
  'Zeeland',
];

// Decision-maker titles in priority order — Apollo weights person_titles
// so list higher-priority titles first
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'Co Founder',
  'General Manager',
];

// Industry keywords Apollo uses for organization tagging
const INDUSTRY_TAGS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Heating & Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Air Conditioning',
  'Refrigeration and Air Conditioning',
];

/**
 * Search Apollo for HVAC contacts matching our criteria.
 *
 * @param {number} page - Page number (1-indexed)
 * @param {number} perPage - Results per page (max 100 on paid; 25 safe on free)
 * @returns {Promise<{contacts: Array, totalEntries: number}>}
 */
async function searchHVACLeads(page = 1, perPage = 25) {
  const payload = {
    api_key: process.env.APOLLO_API_KEY,
    page,
    per_page: perPage,

    // Job title filter — Apollo fuzzy-matches these
    person_titles: TARGET_TITLES,

    // Company location — Apollo accepts "City, State, Country" format.
    // We pass each SW Michigan city; Apollo ORs them together.
    organization_locations: SW_MICHIGAN_CITIES.map((city) => `${city}, Michigan, United States`),

    // Industry keyword tags — Apollo ORs these
    q_organization_keyword_tags: INDUSTRY_TAGS,

    // 1–25 employees (owner-operated small businesses)
    organization_num_employees_ranges: ['1,25'],

    // Only return contacts Apollo has a phone number for
    contact_has_phone: true,
  };

  const response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const data = response.data;

  // Apollo returns people[] and organizations[] separately; map them together
  const orgMap = {};
  if (Array.isArray(data.organizations)) {
    for (const org of data.organizations) {
      orgMap[org.id] = org;
    }
  }

  const contacts = (data.people || []).map((person) => {
    const org = orgMap[person.organization_id] || person.organization || {};

    // Prefer mobile, fall back to direct phone, then first available number
    const phone =
      person.mobile_phone ||
      person.direct_dial_phone ||
      (person.phone_numbers && person.phone_numbers[0]?.sanitized_number) ||
      null;

    return {
      firstName: person.first_name || '',
      lastName: person.last_name || '',
      businessName: org.name || person.organization_name || '',
      phone,
      city: org.city || person.city || '',
      website: org.website_url || org.primary_domain ? `https://${org.primary_domain}` : '',
      // Keep raw for debugging / future use
      _raw: { personId: person.id, orgId: org.id },
    };
  });

  // Drop contacts still missing a phone after our best extraction effort
  const withPhone = contacts.filter((c) => c.phone);

  return {
    contacts: withPhone,
    totalEntries: data.pagination?.total_entries || data.total_entries || 0,
    totalPages: data.pagination?.total_pages || 1,
  };
}

module.exports = { searchHVACLeads, SW_MICHIGAN_CITIES };
