// ─── Apollo.io API ────────────────────────────────────────────────────────────
// Searches for HVAC contacts in Southwest Michigan using the People Search API.
// Docs: https://apolloio.github.io/apollo-api-docs/?shell#mixed-people-search
// ──────────────────────────────────────────────────────────────────────────────

const axios = require('axios');
const { config } = require('./config');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// Build the shared Axios instance so the key is never hardcoded.
function apolloClient() {
  return axios.create({
    baseURL: APOLLO_BASE_URL,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    timeout: 30_000,
  });
}

/**
 * Fetch up to `maxLeads` contacts from Apollo matching the configured filters.
 * Skips contacts that have no phone number on file.
 *
 * Returns an array of plain objects:
 *   { businessName, firstName, lastName, phone, city, website }
 */
async function fetchApolloLeads(maxLeads = 25) {
  const leads = [];
  let page = 1;
  const perPage = 25; // Apollo's max per page is 25

  while (leads.length < maxLeads) {
    const data = await searchPeople(page, perPage);
    const people = data.people || [];

    if (people.length === 0) break;

    for (const person of people) {
      if (leads.length >= maxLeads) break;

      const phone = extractBestPhone(person);
      if (!phone) continue; // Skip contacts with no phone

      const org = person.organization || {};

      leads.push({
        businessName: (org.name || person.organization_name || '').trim(),
        firstName:    (person.first_name || '').trim(),
        lastName:     (person.last_name  || '').trim(),
        phone,
        city:         (person.city || org.city || '').trim(),
        website:      (org.website_url || '').trim(),
      });
    }

    // No further pages available
    if (people.length < perPage) break;
    page++;
  }

  // Drop any lead that somehow has no business name
  return leads.filter(l => l.businessName);
}

/** One API call: people search for the given page. */
async function searchPeople(page, perPage) {
  const client = apolloClient();

  const payload = {
    api_key: process.env.APOLLO_API_KEY,

    // Southwest Michigan city list (see config.js to add/remove cities)
    person_locations: config.apollo.locations,

    // Target job titles in priority order
    person_titles: config.apollo.jobTitles,

    // Owner-operated small businesses only (1–25 employees)
    organization_num_employees_ranges: config.apollo.employeeRanges,

    // HVAC / Plumbing / Mechanical Contracting industries
    q_organization_keyword_tags: config.apollo.industryKeywords,

    // Only return contacts with at least one phone number
    contact_phone_status: ['verified', 'unverified'],

    per_page: perPage,
    page,
  };

  const response = await client.post('/mixed_people/search', payload);
  return response.data;
}

/**
 * Pull the best available phone number from a contact.
 * Priority: mobile → work direct → any other type.
 */
function extractBestPhone(person) {
  const numbers = person.phone_numbers || [];

  const byType = (type) =>
    numbers.find(p => p.type === type && p.sanitized_number)?.sanitized_number;

  return (
    byType('mobile') ||
    byType('work_direct') ||
    numbers.find(p => p.sanitized_number)?.sanitized_number ||
    person.sanitized_phone ||
    null
  );
}

/** Quick smoke-test: a 1-result search that confirms the key is valid. */
async function testApolloConnection() {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY environment variable is not set');
  }

  const client = apolloClient();
  const response = await client.post('/mixed_people/search', {
    api_key: process.env.APOLLO_API_KEY,
    per_page: 1,
    page: 1,
  });

  if (response.data?.error) {
    throw new Error(`Apollo API error: ${response.data.error}`);
  }
}

module.exports = { fetchApolloLeads, testApolloConnection };
