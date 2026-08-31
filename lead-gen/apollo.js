/**
 * Apollo.io API client
 *
 * Uses the /v1/mixed_people/search endpoint to find HVAC decision-makers
 * in Southwest Michigan with verified phone numbers.
 *
 * Docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

/**
 * Build the POST body for Apollo's people-search endpoint.
 * All filter parameters are derived from config.js so they're easy to change.
 */
function buildSearchPayload(page = 1) {
  return {
    api_key: process.env.APOLLO_API_KEY,

    // Location — city list + state fallback
    person_locations: config.TARGET_LOCATIONS,

    // Job title keywords (Apollo does substring matching on these)
    person_titles: config.TARGET_TITLES,

    // Organization filters
    organization_locations: [config.STATE_LOCATION],
    organization_num_employees_ranges: [config.EMPLOYEE_RANGE],

    // Industry tags — Apollo uses keyword matching against its taxonomy
    q_organization_industry_tag_names: config.TARGET_INDUSTRIES,

    // Only return contacts with at least one phone number
    contact_email_status_cd: undefined,        // don't filter by email
    has_phone: true,                           // skip phoneless contacts

    // Pagination
    page,
    per_page: config.MAX_LEADS_PER_RUN,

    // Ask Apollo to include the mobile / direct phone data
    reveal_personal_emails: false,
    reveal_phone_number: true,
  };
}

/**
 * Pick the best available phone number from a contact record.
 * Priority: mobile > direct > first available.
 */
function extractPhone(person) {
  // Apollo returns phone numbers in sanitized_phone and phone_numbers array
  if (person.sanitized_phone) return person.sanitized_phone;

  const phones = person.phone_numbers || [];
  const mobile = phones.find(p => p.type === 'mobile' || p.type === 'personal');
  if (mobile) return mobile.sanitized_number || mobile.raw_number;

  const direct = phones.find(p => p.type === 'work_hq' || p.type === 'work_direct');
  if (direct) return direct.sanitized_number || direct.raw_number;

  if (phones.length > 0) return phones[0].sanitized_number || phones[0].raw_number;

  return '';
}

/**
 * Normalize a contact record from Apollo's response into a flat object
 * that maps 1-to-1 with the spreadsheet columns.
 */
function normalizeContact(person) {
  const org = person.organization || {};
  return {
    businessName: org.name || person.organization_name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: extractPhone(person),
    city: person.city || org.city || '',
    website: org.website_url || person.website_url || '',
  };
}

/**
 * Search Apollo.io for HVAC leads.
 * Returns an array of normalized contact objects.
 *
 * @param {number} page - Page number (1-indexed)
 * @returns {Promise<{contacts: Array, totalCount: number}>}
 */
async function searchLeads(page = 1) {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY environment variable is not set.');
  }

  const payload = buildSearchPayload(page);

  try {
    const response = await axios.post(
      `${APOLLO_BASE_URL}/mixed_people/search`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 30_000,
      }
    );

    const data = response.data;
    const people = data.people || [];
    const totalCount = data.pagination?.total_entries || people.length;

    if (people.length === 0) {
      return { contacts: [], totalCount: 0 };
    }

    // Filter to only contacts that have a phone number (belt-and-suspenders)
    const withPhone = people.filter(p => extractPhone(p));

    const contacts = withPhone.map(normalizeContact).filter(c => c.businessName);

    console.log(`Apollo returned ${people.length} people; ${withPhone.length} have a phone number.`);

    return { contacts, totalCount };
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;

    if (status === 401 || status === 403) {
      throw new Error(`Apollo authentication failed (${status}). Check your APOLLO_API_KEY.`);
    }
    if (status === 429) {
      throw new Error('Apollo rate limit exceeded. The workflow will retry on the next scheduled run.');
    }
    throw new Error(`Apollo API error (${status || 'network'}): ${detail}`);
  }
}

/**
 * Lightweight connectivity check — just validates the API key is accepted.
 */
async function testConnection() {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY environment variable is not set.');
  }

  try {
    // Minimal request — 1 result, broad query
    await axios.post(
      `${APOLLO_BASE_URL}/mixed_people/search`,
      { api_key: process.env.APOLLO_API_KEY, per_page: 1, page: 1 },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 }
    );
    return true;
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      throw new Error(`Apollo rejected the API key (HTTP ${status}).`);
    }
    // A 422/400 still means the key was accepted — the payload was just incomplete
    if (status >= 400 && status < 500) return true;
    throw new Error(`Apollo connection failed: ${err.message}`);
  }
}

module.exports = { searchLeads, testConnection };
