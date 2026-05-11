/**
 * Apollo.io API client for searching HVAC leads in Southwest Michigan.
 *
 * To change target cities or job titles, edit the arrays below.
 * Apollo People Search docs: https://apolloio.github.io/apollo-api-docs
 */

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// Edit this list to change which cities are targeted
const TARGET_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Titles are searched in priority order — Apollo returns ranked results
const JOB_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industry keywords used to filter organizations
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'heating and cooling',
  'plumbing',
  'mechanical contracting',
  'mechanical contractor',
  'air conditioning',
  'ventilation',
];

/**
 * Search Apollo for HVAC decision-makers in Southwest Michigan.
 * @param {number} page     - Page number (1-indexed)
 * @param {number} perPage  - Results per page (max 100)
 * @returns {object} Raw Apollo API response
 */
async function searchHVACLeads(page = 1, perPage = 50) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY environment variable is not set.');
  }

  const payload = {
    api_key: apiKey,
    // Target job titles in priority order
    person_titles: JOB_TITLES,
    // Southwest Michigan cities
    person_locations: TARGET_CITIES,
    // Small owner-operated businesses: 1–25 employees
    organization_num_employees_ranges: ['1,25'],
    // Filter to HVAC/plumbing/mechanical industry by keyword
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    // Only return contacts that have a phone number on file
    contact_phone_exists: true,
    page,
    per_page: perPage,
  };

  const response = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30000,
    }
  );

  return response.data;
}

/**
 * Extract the fields we need from a raw Apollo person record.
 * Returns null if no phone number is available (hard requirement).
 *
 * @param {object} person - Raw person object from Apollo API response
 * @returns {{ businessName, firstName, lastName, phone, city, website } | null}
 */
function extractLeadData(person) {
  const org = person.organization || {};

  // Prefer mobile → direct dial → any phone number on record
  const phone =
    person.mobile_phone ||
    person.direct_phone ||
    (Array.isArray(person.phone_numbers) && person.phone_numbers[0]?.sanitized_number) ||
    null;

  // Skip anyone with no phone — it's a hard requirement
  if (!phone) return null;

  return {
    businessName: (org.name || '').trim(),
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone: phone.trim(),
    city: (person.city || org.city || '').trim(),
    website: (org.website_url || '').trim(),
  };
}

module.exports = { searchHVACLeads, extractLeadData, TARGET_CITIES, JOB_TITLES };
