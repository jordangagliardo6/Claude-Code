/**
 * Apollo.io API client for HVAC lead search.
 *
 * Uses the People Search endpoint to find owner-operated HVAC/plumbing/mechanical
 * businesses in Southwest Michigan with verified phone numbers.
 *
 * API docs: https://apolloio.github.io/apollo-api-docs/?shell#mixed-people-search
 */

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// --- Configuration: edit these to change search scope ---

const TARGET_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Priority order: Owner first, then down the list
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
];

// Employee count range: 1–25 (owner-operated small businesses)
const EMPLOYEE_RANGE = ['1,25'];

// --- End configuration ---

/**
 * Searches Apollo.io for HVAC contacts and returns normalized lead objects.
 * Each returned object has: businessName, firstName, lastName, phone, city, website.
 *
 * @param {number} maxLeads - Maximum contacts to return (default from env, capped at 25)
 * @returns {Promise<Array>}
 */
async function searchHVACLeads(maxLeads = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment');

  const payload = {
    api_key: apiKey,
    // Industry/keyword filter
    q_organization_keyword_tags: TARGET_INDUSTRIES,
    // Company size: 1–25 employees
    organization_num_employees_ranges: EMPLOYEE_RANGE,
    // City + state location targeting
    q_person_locations: TARGET_CITIES,
    // Job title targeting (Apollo OR-matches these)
    person_titles: TARGET_TITLES,
    // Only return contacts that have a phone number
    has_phone: true,
    // Pagination: grab up to maxLeads in one page
    per_page: Math.min(maxLeads, 25),
    page: 1,
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE_URL}/mixed_people/search`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    throw new Error(`Apollo API error (HTTP ${status}): ${detail}`);
  }

  const people = response.data?.people || [];
  if (people.length === 0) return [];

  return people
    .map(normalizeContact)
    .filter(lead => lead.phone); // Extra safety: skip anyone still missing a phone
}

/**
 * Maps a raw Apollo person object to our lead schema.
 */
function normalizeContact(person) {
  const org = person.organization || {};

  // Prefer direct/mobile phone; fall back to any available number
  const phoneNumbers = person.phone_numbers || [];
  const directPhone =
    phoneNumbers.find(p => p.type === 'direct' || p.type === 'mobile') ||
    phoneNumbers[0];
  const phone = directPhone?.sanitized_number || directPhone?.raw_number || '';

  // Apollo sometimes returns city on the person, sometimes on the org
  const city =
    person.city ||
    org.city ||
    '';

  return {
    businessName: org.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: phone,
    city: city,
    website: org.website_url || '',
  };
}

module.exports = { searchHVACLeads, TARGET_CITIES, TARGET_TITLES, TARGET_INDUSTRIES };
