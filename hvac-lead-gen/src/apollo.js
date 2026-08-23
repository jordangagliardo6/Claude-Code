/**
 * Apollo.io API client for HVAC lead prospecting.
 *
 * Requirements:
 *   - Apollo paid plan (Basic or above) to use people search + phone enrichment
 *   - Free plan supports contacts_search (saved contacts only) but not people prospecting
 *
 * Apollo docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// Southwest Michigan cities to bias results toward
const SW_MICHIGAN_CITIES = [
  'St Joseph', 'Benton Harbor', 'Kalamazoo', 'Holland',
  'Grand Haven', 'Muskegon', 'South Haven',
];

// Job titles in priority order (Owner first, then down the chain)
const TARGET_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'general manager',
];

// NAICS 238220 = Plumbing, Heating, and Air-Conditioning Contractors
// SIC 1711 = Plumbing, Heating, Air-Conditioning
const INDUSTRY_NAICS = ['23822'];
const INDUSTRY_SIC = ['1711'];

/**
 * Search Apollo.io for HVAC decision-makers in Southwest Michigan.
 *
 * Returns an array of raw Apollo person objects. Phone numbers are NOT
 * included in search results — call enrichLeads() to fetch them.
 *
 * @param {number} page - Page number (1-indexed)
 * @param {number} perPage - Results per page (max 100)
 */
async function searchHVACLeads(page = 1, perPage = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment');

  const payload = {
    api_key: apiKey,
    q_keywords: SW_MICHIGAN_CITIES.join(' ') + ' HVAC heating air conditioning plumbing',
    person_titles: TARGET_TITLES,
    person_seniorities: ['owner', 'founder', 'c_suite'],
    // Match against HQ location of employer
    organization_locations: ['Michigan, United States'],
    // Match against where the person is based
    person_locations: ['Michigan, United States'],
    // NAICS prefix 23822 covers HVAC/plumbing contractors
    organization_naics_codes: INDUSTRY_NAICS,
    // Companies with 1–25 employees
    organization_num_employees_ranges: ['1,10', '11,25'],
    page,
    per_page: perPage,
  };

  try {
    const response = await axios.post(
      `${APOLLO_BASE_URL}/mixed_people/search`,
      payload,
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    return response.data.people || [];
  } catch (err) {
    const msg = err.response?.data?.error || err.message;
    // Paid-plan gate: surface a clear message so the user knows what to fix
    if (err.response?.status === 403 || msg?.includes('not included in your Free plan')) {
      throw new Error(
        `Apollo API requires a paid plan for people search. ` +
        `Upgrade at https://www.apollo.io/pricing — current error: ${msg}`
      );
    }
    throw new Error(`Apollo search failed: ${msg}`);
  }
}

/**
 * Enrich a list of Apollo person IDs to get phone numbers.
 *
 * Costs 1 direct-dial credit per person enriched.
 * Skip people whose phone is already available to avoid wasting credits.
 *
 * @param {string[]} personIds - Array of Apollo person IDs from searchHVACLeads()
 * @returns {Object[]} Enriched person objects containing sanitized_phone
 */
async function enrichLeads(personIds) {
  if (!personIds.length) return [];
  const apiKey = process.env.APOLLO_API_KEY;

  try {
    const response = await axios.post(
      `${APOLLO_BASE_URL}/people/bulk_match`,
      {
        api_key: apiKey,
        details: personIds.map((id) => ({ id })),
        reveal_personal_emails: false,
        reveal_phone_number: true,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    return response.data.matches || [];
  } catch (err) {
    throw new Error(`Apollo enrichment failed: ${err.response?.data?.error || err.message}`);
  }
}

/**
 * Convert a raw Apollo person object into the lead format the workflow uses.
 *
 * @param {Object} person - Apollo person object (may be from search or enrichment)
 * @returns {Object|null} Normalized lead or null if phone is missing
 */
function normalizeLead(person) {
  // Extract best available phone (mobile preferred, then work)
  const phone =
    person.sanitized_phone ||
    person.phone_numbers?.[0]?.sanitized_number ||
    person.mobile_phone ||
    null;

  // Exclude contacts with no phone (per user requirement)
  if (!phone) return null;

  const org = person.organization || person.employment_history?.[0] || {};
  const city =
    person.city ||
    org.city ||
    SW_MICHIGAN_CITIES.find((c) =>
      (person.location || '').toLowerCase().includes(c.toLowerCase())
    ) ||
    '';

  return {
    businessName: org.name || person.account?.name || '',
    ownerFirstName: person.first_name || '',
    ownerLastName: person.last_name?.replace(/\*/g, '') || '', // strip Apollo masking
    phoneNumber: phone,
    city,
    website: org.website_url || person.account?.domain || '',
  };
}

module.exports = { searchHVACLeads, enrichLeads, normalizeLead };
