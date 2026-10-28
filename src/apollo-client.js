'use strict';

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// Southwest Michigan cities to target — add or remove freely
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Industry keywords Apollo uses to tag organizations
const HVAC_KEYWORD_TAGS = [
  'hvac',
  'heating',
  'air conditioning',
  'plumbing',
  'mechanical contracting',
];

// Job titles in priority order — Owner first, then fallbacks
const TARGET_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'general manager',
];

/**
 * Search Apollo.io for HVAC decision-makers in Southwest Michigan.
 *
 * @param {number} limit  Max results to return (default 25)
 * @returns {Promise<Array>} Array of normalized lead objects
 */
async function searchHvacLeads(limit = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in your .env file');

  const perPage = Math.min(limit, 25); // Apollo free tier caps at 25/page

  const payload = {
    api_key: apiKey,
    // Only return contacts with at least one phone number
    contact_email_status: [],
    person_titles: TARGET_TITLES,
    // 1–25 employees: owner-operated small businesses
    organization_num_employees_ranges: ['1,25'],
    // Bias toward Southwest Michigan
    person_locations: SW_MICHIGAN_CITIES,
    // Industry filter — Apollo matches against company tags
    q_organization_keyword_tags: HVAC_KEYWORD_TAGS,
    // Only include contacts that have a phone number on record
    // (Apollo uses "contact_phone_status" on newer plans; we filter post-fetch too)
    per_page: perPage,
    page: 1,
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Some Apollo plan tiers expect the key in the header instead
        'x-api-key': apiKey,
      },
      timeout: 30000,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    throw new Error(`Apollo API error (HTTP ${status ?? 'network'}): ${detail}`);
  }

  const people = response.data?.people ?? [];
  if (people.length === 0) return [];

  // Normalize each person into the shape the rest of the script expects
  return people
    .map(normalizeContact)
    .filter((c) => c.phone); // drop contacts with no usable phone
}

/**
 * Convert a raw Apollo person object into a clean lead record.
 */
function normalizeContact(person) {
  const phone = pickBestPhone(person.phone_numbers ?? []);
  const org = person.organization ?? {};

  return {
    businessName: org.name || person.organization_name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: phone,
    city: person.city || org.city || '',
    website: org.website_url || '',
  };
}

/**
 * Return the best available phone number from Apollo's array.
 * Priority: mobile > direct > any verified > first available
 */
function pickBestPhone(phoneNumbers) {
  if (!phoneNumbers || phoneNumbers.length === 0) return '';

  const priority = ['mobile', 'direct_phone', 'direct', 'other'];

  for (const type of priority) {
    const match = phoneNumbers.find(
      (p) => p.type === type && p.sanitized_number
    );
    if (match) return match.sanitized_number;
  }

  // Fallback: just return the first number with any value
  const first = phoneNumbers.find((p) => p.sanitized_number || p.raw_number);
  return first ? (first.sanitized_number || first.raw_number) : '';
}

module.exports = { searchHvacLeads };
