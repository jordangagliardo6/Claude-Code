/**
 * apollo.js
 * Handles all Apollo.io API interactions for HVAC lead searching.
 *
 * Apollo People Search docs: https://apolloio.github.io/apollo-api-docs/
 * Uses the /v1/mixed_people/search endpoint to find decision-makers
 * at small HVAC/plumbing/mechanical companies in SW Michigan.
 */

const axios = require('axios');

// ---------------------------------------------------------------------------
// Configuration — edit CITY_LIST or INDUSTRIES here if your needs change
// ---------------------------------------------------------------------------

/**
 * Target cities in Southwest Michigan.
 * Add or remove cities freely — each one becomes a separate search pass
 * so Apollo's location filter stays precise.
 */
const CITY_LIST = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

/**
 * Apollo keyword tags that map to HVAC / Mechanical trades.
 * These are passed as "keywords" in the industry filter.
 */
const INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
];

/**
 * Decision-maker titles in priority order.
 * Apollo returns all matches; we sort client-side by this list.
 */
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * searchLeads(maxResults)
 * Searches Apollo.io for HVAC decision-makers in SW Michigan.
 *
 * @param {number} maxResults  – cap on total leads returned (default 25)
 * @returns {Promise<Lead[]>}  – array of normalised lead objects
 *
 * @typedef {Object} Lead
 * @property {string} businessName
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} phone
 * @property {string} city
 * @property {string} website
 */
async function searchLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY environment variable is not set.');
  }

  const allLeads = [];

  // We iterate over each city so we get geographically specific results.
  // Apollo's location filter can be imprecise for small cities, so targeting
  // one city at a time improves accuracy.
  for (const city of CITY_LIST) {
    if (allLeads.length >= maxResults) break;

    try {
      const batchLeads = await searchCity(apiKey, city, maxResults - allLeads.length);
      allLeads.push(...batchLeads);
    } catch (err) {
      // Log city-level errors but keep going — one bad city shouldn't stop the run
      console.error(`[Apollo] Error searching city "${city}": ${err.message}`);
    }
  }

  // Deduplicate within this batch (same business might appear across city searches)
  const seen = new Set();
  const unique = allLeads.filter((lead) => {
    const key = lead.businessName.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by title priority so the best contacts surface first
  unique.sort((a, b) => titlePriority(a._rawTitle) - titlePriority(b._rawTitle));

  // Strip internal _rawTitle before returning
  return unique.slice(0, maxResults).map(({ _rawTitle, ...rest }) => rest);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * searchCity — calls Apollo for a single city and returns normalised leads.
 */
async function searchCity(apiKey, city, limit) {
  // Apollo mixed_people/search payload
  // Docs: https://apolloio.github.io/apollo-api-docs/#mixed-people-search
  const payload = {
    api_key: apiKey,
    page: 1,
    per_page: Math.min(limit, 25), // Apollo max per page is 25 on most plans
    person_titles: TARGET_TITLES,
    organization_industry_tag_ids: [],          // populated via keyword match below
    organization_keyword_tags: INDUSTRIES,       // keyword-based industry filter
    person_locations: [`${city}, Michigan, United States`],
    organization_locations: ['Michigan, United States'],
    organization_num_employees_ranges: ['1,25'], // 1–25 employees
    contact_phone_exists: true,                  // exclude contacts with no phone
  };

  const response = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000, // 30-second timeout per request
    }
  );

  const people = response.data?.people ?? [];

  if (people.length === 0) {
    console.log(`[Apollo] No results for "${city}".`);
    return [];
  }

  // Normalise Apollo's raw person object into our clean Lead shape
  return people.map((person) => normalisePerson(person)).filter(Boolean);
}

/**
 * normalisePerson — maps an Apollo person record to our Lead shape.
 * Returns null if required fields are missing.
 */
function normalisePerson(person) {
  const firstName = (person.first_name ?? '').trim();
  const lastName = (person.last_name ?? '').trim();
  const businessName = (person.organization?.name ?? person.employment_history?.[0]?.organization_name ?? '').trim();
  const city = extractCity(person);
  const phone = extractPhone(person);
  const website = (person.organization?.website_url ?? person.organization?.primary_domain ?? '').trim();
  const rawTitle = (person.title ?? '').trim();

  // Skip records missing essential fields
  if (!businessName || !phone) return null;

  return {
    businessName,
    firstName,
    lastName,
    phone,
    city,
    website,
    _rawTitle: rawTitle, // used internally for sorting; stripped before export
  };
}

/**
 * extractPhone — prefers direct/mobile numbers over switchboard lines.
 */
function extractPhone(person) {
  // Apollo may provide sanitized_phone, direct_dial_numbers, or phone_numbers
  const directDial = person.direct_dial_number ?? person.direct_dial_numbers?.[0];
  if (directDial) return formatPhone(directDial);

  const mobile = person.phone_numbers?.find(
    (p) => p.type === 'mobile' || p.type === 'direct'
  );
  if (mobile?.sanitized_number) return formatPhone(mobile.sanitized_number);

  const any = person.phone_numbers?.[0]?.sanitized_number ?? person.sanitized_phone;
  return any ? formatPhone(any) : '';
}

/**
 * extractCity — pulls the person's city from location data.
 */
function extractCity(person) {
  if (person.city) return person.city;
  if (person.present_raw_address) {
    // "123 Main St, Kalamazoo, MI 49001, USA" → "Kalamazoo"
    const parts = person.present_raw_address.split(',');
    if (parts.length >= 2) return parts[1].trim();
  }
  return person.organization?.city ?? '';
}

/**
 * formatPhone — converts E.164 / mixed formats to (XXX) XXX-XXXX.
 */
function formatPhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  // Strip leading country code 1
  const local = digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
  if (local.length !== 10) return raw; // return as-is if unexpected length
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/**
 * titlePriority — returns a sort index (lower = higher priority).
 */
function titlePriority(title) {
  const t = (title ?? '').toLowerCase();
  if (t.includes('owner')) return 0;
  if (t.includes('president')) return 1;
  if (t.includes('founder') && !t.includes('co')) return 2;
  if (t.includes('co-founder') || t.includes('cofounder')) return 3;
  if (t.includes('general manager')) return 4;
  return 5;
}

module.exports = { searchLeads, CITY_LIST, INDUSTRIES, TARGET_TITLES };
