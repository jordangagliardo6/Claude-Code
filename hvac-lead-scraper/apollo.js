/**
 * Apollo.io API module — people/organization search for HVAC leads.
 *
 * Apollo docs: https://apolloio.github.io/apollo-api-docs/
 * Endpoint: POST /v1/mixed_people/search
 *
 * Phone numbers are returned for contacts Apollo has enriched.
 * Free tier returns limited phone data; paid tiers return more.
 */

const axios = require('axios');

const APOLLO_API_BASE = 'https://api.apollo.io/v1';

// ── Customization points ──────────────────────────────────────────────────────

// Industries passed to Apollo's q_organization_industries filter.
// Edit this list to expand or narrow the niche.
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating, Ventilation & Air Conditioning',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Mechanical or Industrial Engineering',
  'Building Services',
];

// Job titles searched in priority order. Apollo matches partial titles.
// Edit to add/remove roles.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the best phone number from an Apollo person object.
 * Preference order: mobile → direct → any → org phone.
 */
function extractPhone(person) {
  if (person.mobile_phone) return person.mobile_phone;

  const nums = person.phone_numbers || [];
  const mobile = nums.find(p => p.type === 'mobile');
  if (mobile) return mobile.sanitized_number || mobile.raw_number;

  const direct = nums.find(p => p.type === 'direct');
  if (direct) return direct.sanitized_number || direct.raw_number;

  if (nums.length > 0) return nums[0].sanitized_number || nums[0].raw_number;

  // Fall back to the organization's main line
  return person.organization?.phone || null;
}

/**
 * Search Apollo for HVAC owner-operated businesses in the given cities.
 *
 * @param {string[]} cities         - Array of city names (e.g. ['Kalamazoo', 'Holland'])
 * @param {number}   maxResults     - Maximum leads to return this run
 * @param {Set}      existingNames  - Business names already in the sheet (lowercased)
 * @returns {Promise<Object[]>}     - Array of normalized lead objects
 */
async function searchHvacLeads(cities, maxResults, existingNames) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  // Build location strings Apollo can understand
  const locationStrings = cities.map(c => `${c}, Michigan, United States`);
  // Also add the broad state to catch leads tagged at the state level
  locationStrings.push('Michigan, United States');

  const leads = [];
  let page = 1;

  while (leads.length < maxResults) {
    const perPage = Math.min(maxResults - leads.length, 25); // Apollo caps at 25/page on free tier

    let response;
    try {
      response = await axios.post(
        `${APOLLO_API_BASE}/mixed_people/search`,
        {
          api_key: apiKey,
          q_organization_industries: TARGET_INDUSTRIES,
          person_titles: TARGET_TITLES,
          person_locations: locationStrings,
          // 1–25 employees: owner-operated small businesses
          organization_num_employees_ranges: ['1,25'],
          per_page: perPage,
          page,
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err) {
      if (err.response?.status === 429) {
        throw new Error('Apollo.io rate limit reached. Will retry on the next scheduled run.');
      }
      if (err.response?.status === 401 || err.response?.status === 403) {
        throw new Error('Apollo.io authentication failed. Check your APOLLO_API_KEY.');
      }
      throw new Error(`Apollo.io API error (${err.response?.status}): ${err.message}`);
    }

    const { people = [], pagination } = response.data;

    if (people.length === 0) break;

    for (const person of people) {
      if (leads.length >= maxResults) break;

      const businessName = person.organization?.name?.trim();
      if (!businessName) continue;

      // Skip duplicates already in the sheet
      if (existingNames.has(businessName.toLowerCase())) continue;

      const phone = extractPhone(person);
      if (!phone) continue; // Skip contacts with no phone number at all

      // Narrow results to Southwest Michigan cities (Apollo location match can be loose)
      const personCity = (person.city || person.organization?.city || '').split(',')[0].trim();

      leads.push({
        businessName,
        ownerFirstName: person.first_name || '',
        ownerLastName: person.last_name || '',
        phone,
        city: personCity,
        website: person.organization?.website_url || '',
      });

      // Track to avoid adding the same business twice within this run
      existingNames.add(businessName.toLowerCase());
    }

    if (!pagination || page >= pagination.total_pages) break;
    page++;
  }

  return leads;
}

/**
 * Verify that the Apollo API key is valid by making a minimal search.
 * Throws if authentication fails.
 */
async function verifyApolloConnection() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  try {
    const response = await axios.post(
      `${APOLLO_API_BASE}/mixed_people/search`,
      { api_key: apiKey, per_page: 1, page: 1 },
      { headers: { 'Content-Type': 'application/json' } }
    );
    const { pagination } = response.data;
    return { ok: true, totalRecords: pagination?.total_entries ?? 'unknown' };
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      throw new Error('Invalid Apollo API key');
    }
    throw new Error(`Apollo connection test failed: ${err.message}`);
  }
}

module.exports = { searchHvacLeads, verifyApolloConnection };
