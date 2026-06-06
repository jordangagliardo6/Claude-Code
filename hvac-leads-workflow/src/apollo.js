/**
 * Apollo.io API client
 *
 * Uses the /mixed_people/search endpoint to find HVAC decision-makers
 * in Southwest Michigan. Phone numbers returned here are those already
 * unlocked on your Apollo plan — no extra credit spend required.
 *
 * API docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

const apolloClient = axios.create({
  baseURL: config.apollo.baseUrl,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': config.apollo.apiKey,
  },
  timeout: 30_000,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Choose the best phone number from Apollo's phone_numbers array.
 * Priority: mobile → work_direct_dial → work → first available.
 */
function extractPhone(phoneNumbers) {
  if (!phoneNumbers || phoneNumbers.length === 0) return null;

  const priority = ['mobile', 'work_direct_dial', 'work'];

  for (const type of priority) {
    const match = phoneNumbers.find(p => p.type === type && p.raw_number);
    if (match) return match.raw_number;
  }

  return phoneNumbers[0]?.raw_number || null;
}

/**
 * Convert a raw Apollo person object into the shape our spreadsheet expects.
 * Returns null if there is no phone number (we skip those contacts per spec).
 */
function formatPerson(person) {
  const phone = extractPhone(person.phone_numbers);
  if (!phone) return null;

  const org = person.organization || {};

  return {
    businessName:    org.name            || '',
    ownerFirstName:  person.first_name   || '',
    ownerLastName:   person.last_name    || '',
    phone,
    city:            person.city         || org.city || '',
    website:         org.website_url     || '',
  };
}

// ── Main search ───────────────────────────────────────────────────────────────

/**
 * Call the Apollo People Search API with all HVAC + Michigan filters.
 * @param {number} page - 1-indexed page number
 */
async function searchPeople(page = 1) {
  const body = {
    person_titles:                    config.apollo.targetTitles,
    organization_locations:           [config.apollo.stateLocation],
    organization_num_employees_ranges: config.apollo.employeeRanges,
    q_organization_keyword_tags:      config.apollo.industryTags,
    per_page:                         config.apollo.apolloPageSize,
    page,
  };

  const res = await apolloClient.post('/mixed_people/search', body);
  return res.data;
}

/**
 * Fetch up to maxLeadsPerRun qualified HVAC leads.
 *
 * Strategy:
 *  1. Request apolloPageSize results from Apollo filtered to Michigan.
 *  2. Keep only contacts that have a phone number.
 *  3. Prefer contacts whose city matches one of the SW Michigan target cities.
 *  4. If city-matched results are fewer than 5, fall back to all MI results.
 *  5. Slice to maxLeadsPerRun.
 */
async function fetchHvacLeads() {
  logger.info('Querying Apollo.io for HVAC leads in Michigan...');

  const data = await searchPeople(1);
  const people = data.people || [];

  if (people.length === 0) {
    throw new Error(
      'Apollo returned 0 people. Verify your APOLLO_API_KEY and that your plan ' +
      'supports the /mixed_people/search endpoint.'
    );
  }

  logger.info(`Apollo returned ${people.length} people. Filtering for phone numbers and city...`);

  // Format and drop contacts without phones
  const withPhone = people
    .map(formatPerson)
    .filter(Boolean);

  // Build a set of target city names (lowercased, first segment only e.g. "kalamazoo")
  const targetCityNames = new Set(
    config.apollo.targetCities.map(c => c.split(',')[0].toLowerCase().trim())
  );

  const cityMatched = withPhone.filter(
    lead => targetCityNames.has(lead.city.toLowerCase().trim())
  );

  // Use city-filtered results if we have meaningful coverage; otherwise use all MI
  const results = cityMatched.length >= 5 ? cityMatched : withPhone;

  logger.info(
    `${withPhone.length} leads have phone numbers | ` +
    `${cityMatched.length} match target cities | ` +
    `Using ${results.length} (capped at ${config.apollo.maxLeadsPerRun})`
  );

  return results.slice(0, config.apollo.maxLeadsPerRun);
}

// ── Connection test ───────────────────────────────────────────────────────────

async function testConnection() {
  const data = await searchPeople(1);
  return {
    success: true,
    totalAvailable: data.pagination?.total_entries ?? 0,
    sampleCount:    (data.people || []).length,
  };
}

module.exports = { fetchHvacLeads, testConnection };
