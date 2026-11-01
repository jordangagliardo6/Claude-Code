/**
 * Apollo.io API client
 *
 * Searches for HVAC/mechanical contacts in Southwest Michigan.
 * Targets owner-operated small businesses (1–25 employees).
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// Southwest Michigan cities with their zip codes for tighter geo-filtering
const SW_MICHIGAN_ZIPS = [
  // St. Joseph / Benton Harbor
  '49022', '49023', '49085', '49103',
  // Kalamazoo
  '49001', '49002', '49003', '49004', '49006', '49007', '49008', '49009', '49024', '49048',
  // Holland
  '49422', '49423', '49424', '49464',
  // Grand Haven
  '49417',
  // Muskegon
  '49440', '49441', '49442', '49443', '49444', '49445', '49446',
  // South Haven
  '49090',
];

const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Facilities Services',
];

// Title priority order — Owner > President > Founder > Co-Founder > General Manager
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

/**
 * Search Apollo.io for HVAC leads in Southwest Michigan.
 * Returns up to `limit` contacts that have a phone number.
 */
async function searchLeads(apiKey, limit = 25) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
  };

  // Apollo People Search endpoint — POST /v1/mixed_people/search
  const payload = {
    page: 1,
    per_page: Math.min(limit * 2, 100), // fetch extra to account for no-phone filtering
    person_titles: TARGET_TITLES,
    person_locations: ['Michigan, United States'],
    organization_industry_tag_ids: [], // will use keyword search instead
    q_keywords: TARGET_INDUSTRIES.join(' OR '),
    organization_num_employees_ranges: ['1,25'],
    contact_email_status_or: ['verified', 'unverified', 'unavailable'],
    // require at least one phone number
    has_phone: true,
  };

  let response;
  try {
    response = await axios.post(
      `${APOLLO_BASE}/mixed_people/search`,
      payload,
      { headers, timeout: 30000 }
    );
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;
    throw new Error(`Apollo API request failed (HTTP ${status}): ${detail}`);
  }

  const { people = [], total_entries = 0 } = response.data;

  if (people.length === 0) {
    return { leads: [], total: 0 };
  }

  // Filter to SW Michigan zip codes / cities and contacts with phones
  const swMichiganCities = [
    'st. joseph', 'benton harbor', 'kalamazoo', 'holland', 'grand haven',
    'muskegon', 'south haven', 'bridgman', 'stevensville', 'st joseph',
    'portage', 'oshtemo', 'comstock', 'paw paw', 'allegan',
  ];

  const leads = people
    .filter((p) => {
      const city = (p.city || '').toLowerCase();
      const zip = (p.organization?.postal_code || '').replace(/\s/g, '').substring(0, 5);
      const phone = extractPhone(p);
      if (!phone) return false;
      const cityMatch = swMichiganCities.some((c) => city.includes(c));
      const zipMatch = SW_MICHIGAN_ZIPS.includes(zip);
      return cityMatch || zipMatch;
    })
    .slice(0, limit)
    .map((p) => formatLead(p));

  return { leads, total: total_entries };
}

/** Pick the best available phone number from a contact record */
function extractPhone(person) {
  // Priority: direct phone > mobile > work phone > any phone
  const candidates = [
    person.direct_phone,
    person.mobile_phone,
    ...(person.phone_numbers || []).map((n) => n.sanitized_number || n.raw_number),
  ].filter(Boolean);

  return candidates[0] || null;
}

/** Map an Apollo person record to our flat lead schema */
function formatLead(person) {
  return {
    businessName: person.organization?.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: extractPhone(person) || '',
    city: person.city || person.organization?.city || '',
    website: person.organization?.website_url || '',
  };
}

module.exports = { searchLeads };
