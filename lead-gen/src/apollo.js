/**
 * apollo.js — Apollo.io REST API client for people/contact search.
 *
 * Apollo's People Search endpoint (v1/mixed_people/search) is available on
 * paid plans. If your account is on the free tier you will get a 402/403 error
 * — the error handler in lead-gen-workflow.js will catch it and notify you.
 *
 * Docs: https://apolloio.github.io/apollo-api-docs/?shell#mixed-people-search
 */

const https = require('https');

const APOLLO_BASE = 'api.apollo.io';
const PEOPLE_SEARCH_PATH = '/api/v1/mixed_people/search';

/**
 * Build the Apollo request body from config values.
 *
 * @param {string[]} cities    - Array of "City, State" strings
 * @param {string}   state     - Fallback state-level location
 * @param {object}   config    - Full config module
 * @param {number}   page      - 1-based page number for pagination
 * @returns {object}
 */
function buildRequestBody(cities, state, config, page = 1) {
  return {
    api_key: process.env.APOLLO_API_KEY,
    // Person filters
    person_titles: config.TARGET_JOB_TITLES,
    include_similar_titles: config.INCLUDE_SIMILAR_TITLES,
    // Location: use the city list + broader state fallback
    person_locations: [...cities, state],
    organization_locations: [state],
    // Company filters
    organization_naics_codes: config.NAICS_CODES,
    organization_num_employees_ranges: config.EMPLOYEE_RANGES,
    // Extra keyword signal
    q_keywords: config.APOLLO_KEYWORDS,
    // Pagination — fetch enough to find 25 with phone numbers
    per_page: 50,
    page,
  };
}

/**
 * Make a POST request to Apollo's People Search API.
 * Returns the parsed JSON response body.
 *
 * @param {object} body - JSON request body
 * @returns {Promise<object>}
 */
function apolloPost(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: APOLLO_BASE,
      path: PEOPLE_SEARCH_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Cache-Control': 'no-cache',
        'X-Api-Key': process.env.APOLLO_API_KEY,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const msg = parsed.error || parsed.message || `HTTP ${res.statusCode}`;
            reject(new Error(`Apollo API error (${res.statusCode}): ${msg}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse Apollo response: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Apollo request failed: ${e.message}`)));
    req.write(payload);
    req.end();
  });
}

/**
 * Extract the best available phone number from an Apollo person record.
 * Prefers mobile/direct numbers over company main lines.
 *
 * @param {object} person - Apollo people record
 * @returns {string}
 */
function extractPhone(person) {
  // Apollo returns phone_numbers as an array of { raw_number, sanitized_number, type, ... }
  const phones = person.phone_numbers || [];

  // Priority: mobile > direct > work > any
  const priority = ['mobile', 'direct', 'work', 'other'];
  for (const type of priority) {
    const match = phones.find((p) => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  // Fall back to the first available number
  const first = phones.find((p) => p.sanitized_number || p.raw_number);
  return first ? (first.sanitized_number || first.raw_number) : '';
}

/**
 * Map a raw Apollo person record to the flat lead object used by sheets.js.
 *
 * @param {object} person - Raw Apollo people record
 * @returns {object} Lead with keys: businessName, firstName, lastName, phone, city, website
 */
function mapPersonToLead(person) {
  const org = person.organization || {};
  const city = person.city || org.city || '';
  const state = person.state || org.state || '';
  const cityDisplay = state ? `${city}, ${state}` : city;

  return {
    businessName: org.name || '',
    firstName: person.first_name || '',
    // Apollo sometimes masks last names on lower tiers — use what's available
    lastName: person.last_name || '',
    phone: extractPhone(person),
    city: cityDisplay,
    website: org.website_url || org.primary_domain || '',
  };
}

/**
 * Search Apollo for HVAC owner-level contacts in SW Michigan.
 * Filters out records with no phone number.
 * Returns an array of mapped lead objects (may be larger than MAX_LEADS_PER_RUN).
 *
 * @param {object} config - Config module
 * @returns {Promise<object[]>}
 */
async function searchApolloLeads(config) {
  const body = buildRequestBody(config.TARGET_CITIES, config.TARGET_STATE, config, 1);
  const response = await apolloPost(body);

  const people = response.people || [];
  console.log(`[Apollo] Found ${people.length} people on page 1 (total: ${response.pagination?.total_entries ?? '?'})`);

  // Filter: must have at least one phone number
  const withPhone = people.filter((p) => (p.phone_numbers || []).length > 0);
  console.log(`[Apollo] ${withPhone.length} records have a phone number`);

  return withPhone.map(mapPersonToLead);
}

module.exports = { searchApolloLeads };
