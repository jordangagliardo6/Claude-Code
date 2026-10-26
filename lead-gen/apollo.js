/**
 * apollo.js — Apollo.io People Search API client
 *
 * Docs: https://apolloio.github.io/apollo-api-docs/?shell#people-search
 */

const axios = require('axios');
const {
  SW_MICHIGAN_CITIES,
  TARGET_TITLES,
  TARGET_INDUSTRIES,
  EMPLOYEE_RANGE,
} = require('./config');

const APOLLO_API_BASE = 'https://api.apollo.io/api/v1';

/**
 * Search Apollo.io for HVAC decision-makers in SW Michigan.
 * Returns an array of normalized lead objects, filtered to contacts with phones.
 */
async function searchLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  const payload = {
    api_key: apiKey,
    page: 1,
    per_page: Math.min(maxResults, 100), // Apollo max per_page is 100
    person_titles: TARGET_TITLES,
    person_locations: SW_MICHIGAN_CITIES,
    organization_num_employees_ranges: EMPLOYEE_RANGE,
    q_organization_keyword_tags: TARGET_INDUSTRIES,
    // Only return contacts that have at least one phone number
    has_phone: true,
  };

  let response;
  try {
    response = await axios.post(
      `${APOLLO_API_BASE}/mixed_people/search`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 30_000,
      }
    );
  } catch (err) {
    // Surface a clear message for common HTTP errors
    if (err.response) {
      const { status, data } = err.response;
      throw new Error(
        `Apollo.io API returned HTTP ${status}: ${JSON.stringify(data)}`
      );
    }
    throw err;
  }

  const people = response.data?.people ?? [];
  return people.map(normalizePerson).filter(isValidLead);
}

/**
 * Map a raw Apollo person record to a flat lead object.
 */
function normalizePerson(person) {
  const org = person.organization ?? {};

  // Prefer mobile numbers, fall back to direct/work numbers.
  const phone = pickBestPhone(person.phone_numbers ?? []);

  return {
    businessName: (org.name ?? '').trim(),
    firstName:    (person.first_name ?? '').trim(),
    lastName:     (person.last_name ?? '').trim(),
    phone,
    city:         (person.city ?? org.city ?? '').trim(),
    website:      (org.website_url ?? '').trim(),
  };
}

/**
 * Prefer mobile, then direct, then any sanitized number.
 */
function pickBestPhone(phoneNumbers) {
  const order = ['mobile', 'direct', 'work', 'other'];
  for (const type of order) {
    const match = phoneNumbers.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  // Fall back to whatever is first
  return (phoneNumbers[0]?.sanitized_number ?? '').trim();
}

/**
 * Drop leads with no business name or no phone — unusable for outreach.
 */
function isValidLead(lead) {
  return lead.businessName.length > 0 && lead.phone.length > 0;
}

/**
 * Lightweight connection test — fetches 1 result without writing anything.
 */
async function testConnection() {
  const leads = await searchLeads(1);
  return { ok: true, sampleCount: leads.length };
}

module.exports = { searchLeads, testConnection };
