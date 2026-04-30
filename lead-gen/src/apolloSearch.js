/**
 * apolloSearch.js
 * Queries Apollo.io for HVAC decision-makers in Southwest Michigan.
 *
 * To change target cities, edit TARGET_CITIES.
 * To change target titles, edit TARGET_TITLES (listed in priority order).
 * To change industry keywords, edit INDUSTRY_KEYWORDS.
 */

'use strict';

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// ── Easily configurable search parameters ────────────────────────────────────

// Add or remove cities here. Format: "City, Michigan, United States"
const TARGET_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Apollo matches these against a person's current title (case-insensitive partial match)
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Keywords used to narrow results to HVAC / related industries
const INDUSTRY_KEYWORDS = 'HVAC heating cooling air conditioning plumbing mechanical contractor';

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search Apollo.io for HVAC leads.
 * Returns an array of formatted lead objects.
 *
 * @param {number} maxResults - Max leads to return (applied after phone filter)
 * @returns {Promise<Array>}
 */
async function searchHVACLeads(maxResults = 25) {
  // Request slightly more than needed so we have room after filtering out
  // contacts with no phone numbers.
  const perPage = Math.min(maxResults * 2, 100);

  const payload = {
    api_key: process.env.APOLLO_API_KEY,
    q_keywords: INDUSTRY_KEYWORDS,
    person_titles: TARGET_TITLES,
    person_locations: TARGET_CITIES,
    // "1,25" means 1–25 employees — owner-operated small businesses
    organization_num_employees_ranges: ['1,25'],
    per_page: perPage,
    page: 1,
  };

  let response;
  try {
    response = await axios.post(
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
  } catch (err) {
    const detail =
      err.response?.data?.message ||
      err.response?.data?.error ||
      err.message;
    throw new Error(`Apollo API request failed: ${detail}`);
  }

  const people = response.data?.people ?? [];

  // Only keep contacts that have at least one phone number
  const withPhone = people.filter(
    (p) => Array.isArray(p.phone_numbers) && p.phone_numbers.length > 0
  );

  return withPhone.slice(0, maxResults).map(formatLead);
}

/**
 * Picks the best available phone number and maps the Apollo person object
 * to our flat lead shape.
 */
function formatLead(person) {
  const phones = person.phone_numbers ?? [];
  // Prefer direct/mobile over work/other
  const best =
    phones.find((p) => p.type === 'direct_phone' || p.type === 'mobile') ??
    phones[0];

  return {
    businessName: person.organization?.name ?? '',
    firstName: person.first_name ?? '',
    lastName: person.last_name ?? '',
    phone: best?.sanitized_number ?? '',
    city:
      person.city ??
      person.organization?.city ??
      '',
    website: person.organization?.website_url ?? '',
  };
}

module.exports = { searchHVACLeads };
