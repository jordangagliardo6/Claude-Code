/**
 * Apollo.io People Search client
 *
 * Targets owner-operated HVAC / plumbing / mechanical companies
 * in Southwest Michigan with ≤25 employees that have a phone number.
 *
 * To change the cities, industries, or job titles searched,
 * edit the constants at the top of this file.
 */

'use strict';

const axios = require('axios');

// ─── Easily-editable search config ───────────────────────────────────────────

// Cities (and surrounding areas) to target — Apollo accepts "City, State, Country"
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Job titles in priority order (Apollo searches all of these simultaneously)
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industry keyword tags — Apollo matches these against company profiles
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating',
  'air conditioning',
  'plumbing',
  'mechanical contractor',
  'heating and cooling',
];

// Company size range: 1–25 employees (owner-operated small businesses)
const EMPLOYEE_RANGE = ['1,25'];

// ─────────────────────────────────────────────────────────────────────────────

const APOLLO_API_URL = 'https://api.apollo.io/v1/mixed_people/search';

/**
 * Search Apollo for leads and return normalized objects.
 * Fetches up to `fetchLimit` contacts; the caller handles duplicate filtering
 * and the final per-run cap.
 *
 * @param {number} fetchLimit - max contacts to request from Apollo
 * @returns {Promise<Array<{businessName, firstName, lastName, phone, city, website}>>}
 */
async function searchLeads(fetchLimit = 50) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const payload = {
    per_page: Math.min(fetchLimit, 100), // Apollo caps at 100 per page
    page: 1,

    // Decision-maker titles only
    person_titles: TARGET_TITLES,

    // Company must be in SW Michigan
    organization_locations: SW_MICHIGAN_LOCATIONS,

    // 1–25 employees
    organization_num_employees_ranges: EMPLOYEE_RANGE,

    // Contacts that have a phone number on record
    contact_phone_number_status: ['verified', 'likely_to_engage'],

    // Industry tags (HVAC / plumbing related)
    organization_keyword_tags: INDUSTRY_KEYWORDS,
  };

  const response = await axios.post(APOLLO_API_URL, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    timeout: 30_000,
  });

  const contacts = response.data.people || [];

  const leads = contacts
    .map(contact => ({
      businessName: contact.organization?.name || '',
      firstName:    contact.first_name || '',
      lastName:     contact.last_name  || '',
      phone:        pickBestPhone(contact.phone_numbers || []),
      city:         contact.city || contact.organization?.city || '',
      website:      contact.organization?.website_url || '',
    }))
    .filter(lead => lead.businessName && lead.phone); // must have both

  return leads;
}

/**
 * Pick the best available phone number.
 * Priority: mobile → direct → work → any
 *
 * @param {Array} phoneNumbers - Apollo phone_numbers array
 * @returns {string|null}
 */
function pickBestPhone(phoneNumbers) {
  const priority = ['mobile', 'direct_phone', 'work', 'other'];

  for (const type of priority) {
    const match = phoneNumbers.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }

  // Fall back to any number that has been sanitized
  const fallback = phoneNumbers.find(p => p.sanitized_number);
  return fallback ? fallback.sanitized_number : null;
}

module.exports = { searchLeads };
