/**
 * src/apollo.js — All Apollo.io REST API interactions.
 *
 * Apollo's People Search endpoint does not return phone numbers.
 * We use it to find owner-level contacts, then enrich each person
 * to retrieve their direct or mobile phone before writing to the sheet.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const config = require('../config');

const BASE_URL = 'https://api.apollo.io/v1';

function apolloClient() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY is not set in your .env file.');
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': key,
    },
    timeout: 30000,
  });
}

/**
 * Search Apollo for owner-level contacts at small HVAC companies in SW Michigan.
 * Returns raw Apollo person objects (phone numbers NOT included at this stage).
 *
 * @param {number} maxResults - Maximum contacts to return
 * @returns {Promise<Array>}
 */
async function searchHVACContacts(maxResults) {
  const client = apolloClient();

  // Build location list: individual cities + state fallback
  const locations = [...config.TARGET_CITIES, config.TARGET_STATE];

  const payload = {
    per_page: Math.min(maxResults, 100),
    page: 1,

    // Decision-maker titles in priority order
    person_titles: config.TARGET_TITLES,
    include_similar_titles: true,

    // Owner-level seniority signals
    person_seniorities: ['owner', 'founder', 'c_suite'],

    // SW Michigan cities + state
    person_locations: locations,
    organization_locations: locations,

    // Small business filter (1–25 employees)
    organization_num_employees_ranges: [config.EMPLOYEE_RANGE],

    // Industry keywords
    q_organization_keyword_tags: config.INDUSTRY_KEYWORDS,
  };

  const response = await client.post('/mixed_people/search', payload);
  const people = response.data?.people || [];

  // Sort by title priority so "Owner" beats "General Manager" when deduping by company
  return sortByTitlePriority(people).slice(0, maxResults);
}

/**
 * Enrich a single person by Apollo ID to retrieve phone numbers.
 * Returns null when the person isn't found or has no phone numbers.
 *
 * Note: Each enrichment call costs 1 Apollo credit.
 *
 * @param {string} apolloPersonId
 * @param {string} organizationName - used as fallback context
 * @returns {Promise<object|null>}
 */
async function enrichContact(apolloPersonId, organizationName) {
  const client = apolloClient();
  try {
    const response = await client.post('/people/match', {
      id: apolloPersonId,
      organization_name: organizationName,
      reveal_phone_number: true,
    });
    const person = response.data?.person;
    if (!person) return null;

    const phone = extractPhone(person);
    if (!phone) return null; // skip contacts without any phone

    return { ...person, _resolvedPhone: phone };
  } catch (err) {
    // Non-fatal: log and skip this contact
    console.warn(`  ⚠  Could not enrich ${apolloPersonId}: ${err.message}`);
    return null;
  }
}

/**
 * Extract the best available phone from an Apollo person record.
 * Priority: direct > mobile > corporate > other
 */
function extractPhone(person) {
  return (
    person.direct_phone ||
    person.mobile_phone ||
    person.corporate_phone ||
    (person.phone_numbers?.[0]?.sanitized_number) ||
    null
  );
}

/**
 * Sort person array so the highest-priority title appears first per company.
 * When we dedupe by business name later, the first match (highest priority) is kept.
 */
function sortByTitlePriority(people) {
  return people.sort((a, b) => {
    const rankA = getTitleRank(a.title);
    const rankB = getTitleRank(b.title);
    return rankA - rankB;
  });
}

function getTitleRank(title) {
  if (!title) return 999;
  const t = title.toLowerCase();
  const priorities = config.TARGET_TITLES.map((p) => p.toLowerCase());
  for (let i = 0; i < priorities.length; i++) {
    if (t.includes(priorities[i])) return i;
  }
  return 999;
}

module.exports = { searchHVACContacts, enrichContact };
