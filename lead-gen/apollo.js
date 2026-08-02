/**
 * apollo.js — Apollo.io API helpers
 *
 * Handles people search + enrichment for HVAC leads in SW Michigan.
 * Uses the Apollo REST API directly with your APOLLO_API_KEY.
 *
 * Required plan: Apollo Basic ($49/mo) or higher gives full API access.
 * Free plan only allows limited endpoints.
 */

const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/v1';

// ── Configuration ─────────────────────────────────────────────────────────────

// Edit these city names freely — they filter the person location field
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'Saint Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
  // Surrounding areas
  'Stevensville, Michigan',
  'Watervliet, Michigan',
  'Paw Paw, Michigan',
  'Three Rivers, Michigan',
  'Mattawan, Michigan',
  'Zeeland, Michigan',
  'Allegan, Michigan',
  'Otsego, Michigan',
];

// Job title priority order — we pick the highest-priority title found per company
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Apollo keyword tags that map to HVAC / plumbing / mechanical industries
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'Heating',
  'Air Conditioning',
  'Cooling',
  'Plumbing',
  'Mechanical Contractor',
  'Mechanical Contracting',
  'Heating and Cooling',
  'Refrigeration',
];

// Employee size brackets (1–25 people)
const EMPLOYEE_RANGES = ['1,10', '11,25'];

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC decision-makers in SW Michigan.
 * Returns an array of raw Apollo person objects (no phone numbers yet).
 *
 * @param {number} page - 1-indexed page number
 * @param {number} perPage - results per page (max 100)
 */
async function searchHVACPeople(page = 1, perPage = 50) {
  const apiKey = process.env.APOLLO_API_KEY;

  const payload = {
    // Limit to Michigan — Apollo uses person_locations for where the PERSON is based
    person_locations: ['Michigan, United States'],

    // Job titles we want
    person_titles: TARGET_TITLES,
    include_similar_titles: false, // exact matches only

    // Seniority filter
    person_seniorities: ['owner', 'founder', 'c_suite'],

    // Company headquarters also in Michigan
    organization_locations: ['Michigan, United States'],

    // Small businesses only (owner-operated)
    organization_num_employees_ranges: EMPLOYEE_RANGES,

    // Industry keywords
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,

    // Boost SW Michigan cities in the keyword search
    q_keywords: SW_MICHIGAN_CITIES.join(' '),

    page,
    per_page: perPage,
  };

  const response = await axios.post(
    `${BASE_URL}/mixed_people/search`,
    payload,
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  return response.data;
}

// ── Enrichment ────────────────────────────────────────────────────────────────

/**
 * Enrich a single person to attempt to get phone numbers.
 * Set revealPhone=true to trigger async phone lookup (costs credits).
 *
 * IMPORTANT: When revealPhone=true, the result is returned immediately with
 * a request_id. You must poll GET /v1/people/requests/:request_id for the
 * actual phone number (see pollForPhone below).
 *
 * @param {object} params - {id, firstName, lastName, domain, orgName}
 * @param {boolean} revealPhone - whether to trigger phone lookup
 */
async function enrichPerson(params, revealPhone = false) {
  const apiKey = process.env.APOLLO_API_KEY;

  const payload = {
    ...(params.id && { id: params.id }),
    ...(params.firstName && { first_name: params.firstName }),
    ...(params.lastName && { last_name: params.lastName }),
    ...(params.domain && { domain: params.domain }),
    ...(params.orgName && { organization_name: params.orgName }),
    reveal_personal_emails: false,
    reveal_phone_number: revealPhone,
  };

  const response = await axios.post(`${BASE_URL}/people/match`, payload, {
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  return response.data;
}

/**
 * Poll the async phone reveal result.
 * Apollo returns a request_id when reveal_phone_number=true.
 * Poll this endpoint until status is 'complete' or timeout.
 *
 * @param {string} requestId - the top-level request_id from enrichPerson
 * @param {number} maxWaitMs - max milliseconds to wait (default 60s)
 */
async function pollForPhone(requestId, maxWaitMs = 60000) {
  const apiKey = process.env.APOLLO_API_KEY;
  const interval = 5000; // poll every 5 seconds
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await sleep(interval);

    const response = await axios.get(
      `${BASE_URL}/people/requests/${requestId}`,
      {
        headers: { 'x-api-key': apiKey },
        timeout: 15000,
      }
    );

    const { status, person } = response.data;

    if (status === 'complete' && person) {
      return person;
    }

    if (status === 'failed') {
      return null;
    }
    // status === 'pending' → keep polling
  }

  return null; // timed out
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the best available phone number from an Apollo person object.
 * Prefers mobile → direct → primary.
 */
function extractPhone(person) {
  // Phones array (from enrichment)
  if (person.phone_numbers && person.phone_numbers.length > 0) {
    const mobile = person.phone_numbers.find(
      (p) => p.type === 'mobile' || p.dnc_status === null
    );
    if (mobile) return mobile.sanitized_number || mobile.raw_number;
    return (
      person.phone_numbers[0].sanitized_number ||
      person.phone_numbers[0].raw_number
    );
  }

  // Sanitized phone from basic search result
  if (person.sanitized_phone) return person.sanitized_phone;
  if (person.phone) return person.phone;

  // Organization's primary phone as fallback
  if (person.organization?.primary_phone?.number) {
    return person.organization.primary_phone.number;
  }

  return null;
}

/**
 * Check if a city from Apollo is in SW Michigan.
 * Apollo city values are often just the city name (no state).
 */
function isInSWMichigan(person) {
  const city = (person.city || '').toLowerCase();
  const state = (person.state || '').toLowerCase();

  if (state && !['michigan', 'mi'].includes(state)) return false;

  const swCityNames = SW_MICHIGAN_CITIES.map((c) =>
    c.replace(/, michigan/i, '').toLowerCase().trim()
  );

  return swCityNames.some(
    (c) => city.includes(c) || c.includes(city)
  );
}

/**
 * Filter and sort a list of people by title priority.
 * If multiple contacts exist for the same company, pick the highest-priority one.
 */
function pickBestContactPerCompany(people) {
  const byCompany = {};

  for (const person of people) {
    const companyName = (
      person.organization?.name ||
      person.account?.name ||
      ''
    ).toLowerCase().trim();

    if (!companyName) continue;

    const existingPriority = byCompany[companyName]
      ? TARGET_TITLES.findIndex((t) =>
          (byCompany[companyName].title || '').toLowerCase().includes(t.toLowerCase())
        )
      : 999;

    const thisPriority = TARGET_TITLES.findIndex((t) =>
      (person.title || '').toLowerCase().includes(t.toLowerCase())
    );

    if (!byCompany[companyName] || thisPriority < existingPriority) {
      byCompany[companyName] = person;
    }
  }

  return Object.values(byCompany);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  searchHVACPeople,
  enrichPerson,
  pollForPhone,
  extractPhone,
  isInSWMichigan,
  pickBestContactPerCompany,
  SW_MICHIGAN_CITIES,
  sleep,
};
