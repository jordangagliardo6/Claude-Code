/**
 * Apollo.io People Search client.
 *
 * Uses POST /v1/mixed_people/search to find owner-operated HVAC companies
 * in Southwest Michigan. Returns an array of normalized lead objects.
 *
 * To add/remove cities, update CITIES below.
 * To change industries, update INDUSTRIES below.
 * To change job titles, update JOB_TITLES below.
 */

'use strict';

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// --- Configurable targets -------------------------------------------------

const CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Apollo industry slugs (must match Apollo's taxonomy exactly)
const INDUSTRIES = [
  'hvac',
  'heating, ventilation and air conditioning (hvac)',
  'plumbing',
  'mechanical or industrial engineering',
  'construction',
];

// Priority order: Owner first, then fall back to others
const JOB_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// --- Helpers --------------------------------------------------------------

/**
 * Pick the best phone number from a contact's phone_numbers array.
 * Prefers mobile > direct > work in that order.
 * Returns null if none exist.
 */
function pickPhone(phoneNumbers) {
  if (!phoneNumbers || phoneNumbers.length === 0) return null;

  const priority = ['mobile', 'direct', 'work', 'other'];
  for (const type of priority) {
    const match = phoneNumbers.find(
      (p) => p.type === type && p.sanitized_number
    );
    if (match) return match.sanitized_number;
  }
  // Fall back to first available
  const first = phoneNumbers.find((p) => p.sanitized_number);
  return first ? first.sanitized_number : null;
}

/**
 * Normalize a raw Apollo person record into a flat lead object.
 */
function normalizeLead(person) {
  const org = person.organization || {};
  const phone = pickPhone(person.phone_numbers);

  return {
    businessName: org.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: phone || '',
    city: person.city || '',
    website: org.primary_domain
      ? `https://${org.primary_domain}`
      : org.website_url || '',
  };
}

// --- Main export ----------------------------------------------------------

/**
 * Search Apollo.io for HVAC leads in Southwest Michigan.
 *
 * @param {string} apiKey    - APOLLO_API_KEY environment variable
 * @param {number} maxLeads  - Maximum number of leads to return
 * @returns {Promise<Array>} - Array of normalized lead objects
 */
async function fetchApolloLeads(apiKey, maxLeads = 25) {
  const payload = {
    api_key: apiKey,
    page: 1,
    per_page: Math.min(maxLeads, 100), // Apollo max per page
    person_titles: JOB_TITLES,
    q_organization_industries: INDUSTRIES,
    organization_num_employees_ranges: ['1,25'],
    organization_locations: CITIES,
    // Sort by most recently updated so each daily run surfaces fresh records
    sort_by_field: 'contact_updated_at',
    sort_ascending: false,
  };

  const response = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    }
  );

  const people = response.data.people || [];

  // Normalize, then drop contacts with no phone (required per workflow spec)
  const leads = people
    .map(normalizeLead)
    .filter((lead) => lead.phone && lead.businessName);

  return leads.slice(0, maxLeads);
}

module.exports = { fetchApolloLeads };
