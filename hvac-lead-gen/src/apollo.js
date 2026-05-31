/**
 * apollo.js — Apollo.io API client.
 * Searches for HVAC owner contacts using the mixed_people/search endpoint.
 */

const axios = require('axios');
const config = require('./config');

const BASE_URL = 'https://api.apollo.io/api/v1';

function getApiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY is not set in environment variables.');
  return key;
}

// Verify the API key is valid by running a minimal (1-result) search.
// Throws if the key is rejected or the network is unreachable.
async function testApolloConnection() {
  const response = await axios.post(
    `${BASE_URL}/mixed_people/search`,
    {
      api_key: getApiKey(),
      page: 1,
      per_page: 1,
      person_titles: ['Owner'],
      organization_locations: ['Michigan, United States'],
    },
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' } }
  );

  // Apollo returns { people: [...], pagination: {...} } on success
  if (!response.data || typeof response.data.people === 'undefined') {
    throw new Error('Unexpected response shape from Apollo — check your API key.');
  }

  return {
    ok: true,
    totalAvailable: response.data.pagination?.total_entries ?? 'unknown',
  };
}

// Search Apollo for HVAC owner contacts in Southwest Michigan.
// Fetches (maxResults × apolloFetchBuffer) results so there is room to
// absorb duplicates and no-phone records after client-side filtering.
async function searchHvacLeads(maxResults) {
  const perPage = Math.min(maxResults * config.apolloFetchBuffer, 100);

  const body = {
    api_key: getApiKey(),
    page: 1,
    per_page: perPage,

    // Decision-maker titles in priority order
    person_titles: config.targetTitles,

    // Company HQ must be in one of the target SW Michigan cities
    organization_locations: config.targetCities,

    // 1–25 employees — owner-operated small businesses
    organization_num_employees_ranges: config.employeeRange,

    // Industry keyword matching
    q_organization_keyword_tags: config.industryKeywords,

    // Ask Apollo to only return contacts that have a phone number on file.
    // We also filter client-side (below) in case the API ignores this flag.
    contact_phone_numbers_not_blank: true,
  };

  const response = await axios.post(`${BASE_URL}/mixed_people/search`, body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    timeout: 30_000,
  });

  const raw = response.data.people || [];

  // Normalize → filter no-phone → cap at maxResults
  return raw
    .filter(person => person.phone_numbers && person.phone_numbers.length > 0)
    .map(normalizeLead)
    .filter(lead => lead.phoneNumber) // belt-and-suspenders: skip if phone still empty
    .slice(0, maxResults);
}

// Map one Apollo person object to our internal lead schema.
function normalizeLead(person) {
  const org = person.organization || {};
  return {
    dateAdded:    formatDate(new Date()),
    businessName: (org.name              || '').trim(),
    firstName:    (person.first_name     || '').trim(),
    lastName:     (person.last_name      || '').trim(),
    phoneNumber:  pickBestPhone(person.phone_numbers || []),
    city:         (person.city || org.city || '').trim(),
    website:      (org.website_url        || '').replace(/\/$/, '').trim(),
  };
}

// Prefer mobile → direct → any other number.
function pickBestPhone(phoneNumbers) {
  const priority = ['mobile_phone', 'direct_phone'];
  for (const type of priority) {
    const match = phoneNumbers.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  const fallback = phoneNumbers.find(p => p.sanitized_number);
  return fallback ? fallback.sanitized_number : null;
}

// Returns M/D/YYYY string consistent with how Google Sheets displays dates.
function formatDate(d) {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

module.exports = { searchHvacLeads, testApolloConnection };
