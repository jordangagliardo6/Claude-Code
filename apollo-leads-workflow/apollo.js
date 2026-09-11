/**
 * Apollo.io REST API wrapper for HVAC lead prospecting.
 *
 * Apollo endpoints used:
 *   POST /v1/mixed_people/search  — search people (returns IDs + partial data)
 *   POST /v1/people/bulk_match    — enrich up to 10 people to get full phone numbers
 *
 * Credit note: bulk_match enrichment costs Apollo credits.
 * Free plan: ~50 enrichments/month.  Basic ($49/mo): 1,000/month.
 * The script only enriches contacts when a phone isn't already in the search result.
 */

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/v1';

function getApiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY environment variable is not set.');
  return key;
}

/**
 * Search Apollo's people database for HVAC decision-makers in SW Michigan.
 * Returns raw Apollo "people" objects — phone numbers may be empty until enriched.
 *
 * @param {number} page      - Page number (1-indexed)
 * @param {number} perPage   - Results per page (max 100)
 * @returns {{ people: object[], pagination: object }}
 */
async function searchPeople(page = 1, perPage = config.APOLLO_PAGE_SIZE) {
  const response = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    {
      api_key: getApiKey(),
      person_titles: config.TARGET_TITLES,
      person_locations: config.TARGET_CITIES,
      organization_num_employees_ranges: config.EMPLOYEE_RANGES,
      q_organization_keyword_tags: config.INDUSTRY_TAGS,
      include_similar_titles: false, // strict match on job titles
      per_page: perPage,
      page,
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
  );

  return {
    people: response.data.people || [],
    pagination: response.data.pagination || {},
  };
}

/**
 * Enrich up to 10 Apollo people by ID to reveal phone numbers.
 * Uses Apollo credits — only call this for contacts missing a phone number.
 *
 * @param {string[]} personIds  - Apollo person IDs from searchPeople()
 * @returns {object[]}          - Enriched person objects (matches array)
 */
async function enrichPeople(personIds) {
  if (!personIds.length) return [];

  // Apollo bulk_match accepts max 10 at a time
  const batches = [];
  for (let i = 0; i < personIds.length; i += 10) {
    batches.push(personIds.slice(i, i + 10));
  }

  const results = [];
  for (const batch of batches) {
    const response = await axios.post(
      `${APOLLO_BASE}/people/bulk_match`,
      {
        api_key: getApiKey(),
        details: batch.map(id => ({ id })),
        reveal_personal_emails: false,
        reveal_phone_number: true,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    results.push(...(response.data.matches || []));
  }

  return results;
}

/**
 * Extract a clean phone number string from an Apollo person object.
 * Prefers mobile → direct → any available number.
 *
 * @param {object} person - Apollo person object
 * @returns {string}      - Formatted phone number, or empty string
 */
function extractPhone(person) {
  const numbers = person.phone_numbers || [];

  // Prefer mobile, then direct, then any
  const priority = ['mobile', 'direct', 'work', 'other'];
  for (const type of priority) {
    const match = numbers.find(n => n.type === type);
    if (match?.sanitized_number) return match.sanitized_number;
  }

  // Fall back to top-level sanitized_phone
  if (person.sanitized_phone) return person.sanitized_phone;

  // Last resort: use the organization's main phone (often the owner picks up)
  return person.organization?.phone || '';
}

/**
 * Verify that the Apollo API key is valid by making a lightweight request.
 * Throws on auth failure; resolves silently on success.
 */
async function verifyCredentials() {
  await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    { api_key: getApiKey(), per_page: 1, page: 1 },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );
}

module.exports = { searchPeople, enrichPeople, extractPhone, verifyCredentials };
