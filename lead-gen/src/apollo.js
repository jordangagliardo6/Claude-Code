'use strict';

require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// ─────────────────────────────────────────────────────────────────────────────
// City list — edit this array to add / remove target cities at any time.
// Apollo accepts "City, State, Country" strings.
// ─────────────────────────────────────────────────────────────────────────────
const TARGET_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// ─────────────────────────────────────────────────────────────────────────────
// Job titles — ordered by priority. Apollo matches any title in the array.
// ─────────────────────────────────────────────────────────────────────────────
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Keywords that appear in the organization's industry or name.
// Apollo uses q_keywords against the full person + organization profile.
const INDUSTRY_KEYWORDS = 'HVAC heating cooling "air conditioning" plumbing "mechanical contractor"';

// ─────────────────────────────────────────────────────────────────────────────
// Normalize a raw Apollo person record into a flat lead object.
// Returns null if the contact has no usable phone number.
// ─────────────────────────────────────────────────────────────────────────────
function normalizePerson(person) {
  // Apollo returns phone_numbers as an array; prefer mobile then direct then any.
  const phones = person.phone_numbers || [];
  const phone =
    phones.find((p) => p.type === 'mobile')?.raw_number ||
    phones.find((p) => p.type === 'direct')?.raw_number ||
    phones.find((p) => p.raw_number)?.raw_number ||
    person.sanitized_phone ||
    null;

  // Skip contacts with no phone — per requirements.
  if (!phone) return null;

  const org = person.organization || {};

  return {
    businessName: org.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: phone.replace(/\s+/g, ' ').trim(),
    city: org.city || person.city || '',
    website: org.website_url || org.primary_domain || '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Search Apollo for HVAC leads.
//
// @param {number} page      - 1-based page number
// @param {number} perPage   - results per page (max 25 on most plans)
// @returns {{ leads: Lead[], totalEntries: number, totalPages: number }}
// ─────────────────────────────────────────────────────────────────────────────
async function searchHVACLeads(page = 1, perPage = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment');

  const payload = {
    api_key: apiKey,
    page,
    per_page: perPage,

    // Contact-level filters
    person_titles: TARGET_TITLES,

    // Only pull contacts Apollo believes have a phone number.
    // "likely_to_have_phone" casts a wider net than "yes" alone.
    contact_phone_status: ['yes', 'likely_to_have_phone'],

    // Location filters — person's listed city or company headquarters
    person_locations: TARGET_LOCATIONS,
    organization_locations: ['Michigan, United States'],

    // Company size: owner-operated small businesses only
    organization_num_employees_ranges: ['1,25'],

    // Free-text keyword search applied across the entire profile/org record.
    // This is the most reliable way to target HVAC without needing Apollo
    // industry tag IDs (which are internal and subject to change).
    q_keywords: INDUSTRY_KEYWORDS,
  };

  logger.info(`Apollo search — page ${page}, ${perPage} per page`);

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      timeout: 30_000,
    });
  } catch (err) {
    if (err.response) {
      // Apollo returned an HTTP error — surface the body for easier debugging.
      const status = err.response.status;
      const body = JSON.stringify(err.response.data);
      throw new Error(`Apollo API error ${status}: ${body}`);
    }
    throw err;
  }

  const data = response.data;
  const rawPeople = data.people || data.contacts || [];
  const pagination = data.pagination || {};

  logger.info(`Apollo returned ${rawPeople.length} raw records (page ${page}/${pagination.total_pages || '?'})`);

  const leads = rawPeople
    .map(normalizePerson)
    .filter(Boolean); // drop contacts with no phone

  return {
    leads,
    totalEntries: pagination.total_entries || rawPeople.length,
    totalPages: pagination.total_pages || 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight connectivity test — used by test-connection.js.
// Fetches page 1 with perPage=1; succeeds if the API key is valid.
// ─────────────────────────────────────────────────────────────────────────────
async function testConnection() {
  const result = await searchHVACLeads(1, 1);
  return result;
}

module.exports = { searchHVACLeads, testConnection, TARGET_LOCATIONS, TARGET_TITLES };
