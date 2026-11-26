'use strict';

/**
 * Apollo.io People Search client.
 *
 * API docs: https://apolloio.github.io/apollo-api-docs/?shell#search-for-people
 * Endpoint: POST https://api.apollo.io/v1/mixed_people/search
 *
 * To add/remove cities: edit SW_MICHIGAN_CITIES below.
 * To add/remove industries: edit TARGET_INDUSTRIES below.
 * To change job title priority: edit TARGET_TITLES below.
 */

const axios = require('axios');
const logger = require('./logger');

const APOLLO_API_BASE = 'https://api.apollo.io/v1';

// ── Easily configurable target list ──────────────────────────────────────────

const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Apollo industry tag names — these map to Apollo's internal taxonomy.
// See your Apollo account under Filters > Industry to verify exact names.
const TARGET_INDUSTRIES = [
  'hvac',
  'heating, ventilating & air conditioning',
  'plumbing',
  'plumbing & heating equipment',
  'mechanical or industrial engineering',
  'mechanical contracting',
];

// Titles are tried in priority order. Apollo returns the best match per company.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'Co Founder',
  'General Manager',
];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC leads in SW Michigan.
 * Returns an array of raw Apollo "person" objects.
 */
async function searchLeads(limit = 25) {
  logger.info(`Querying Apollo.io for up to ${limit} leads in SW Michigan...`);

  const payload = {
    api_key: process.env.APOLLO_API_KEY,
    per_page: limit,
    page: 1,

    // Job titles — priority order matters; Apollo ranks by first match
    person_titles: TARGET_TITLES,

    // Company location — broad state filter first, then city-level bias
    organization_locations: ['Michigan, United States'],
    person_locations: SW_MICHIGAN_CITIES,

    // Company size: 1–25 employees (owner-operated small businesses)
    organization_num_employees_ranges: ['1,25'],

    // Industries
    q_organization_industry_tag_names: TARGET_INDUSTRIES,

    // Only return contacts that have a phone number
    contact_phone_numbers_quality_score_min: 1,
  };

  const response = await axios.post(
    `${APOLLO_API_BASE}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': process.env.APOLLO_API_KEY,
      },
      timeout: 30000,
    }
  );

  const people = response.data.people || [];
  logger.info(`Apollo returned ${people.length} raw result(s).`);
  return people;
}

/**
 * Map a raw Apollo person object to our lead schema.
 * Returns null if the contact has no usable phone number.
 */
function mapToLead(person) {
  const phone =
    person.sanitized_phone ||
    (person.phone_numbers && person.phone_numbers[0]?.sanitized_number) ||
    person.mobile_phone ||
    null;

  // Skip anyone without a phone — per requirements
  if (!phone) return null;

  const org = person.organization || {};
  const city =
    person.city ||
    (person.location && person.location.split(',')[0]?.trim()) ||
    '';

  return {
    businessName: org.name || person.organization_name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone,
    city,
    website: org.website_url || org.primary_domain || '',
  };
}

module.exports = { searchLeads, mapToLead, SW_MICHIGAN_CITIES, TARGET_INDUSTRIES, TARGET_TITLES };
