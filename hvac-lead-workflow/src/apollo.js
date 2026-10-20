/**
 * Apollo.io API integration
 *
 * Searches for HVAC owner/decision-maker contacts in Southwest Michigan.
 * Docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// Southwest Michigan cities and their zip codes used as location filters
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Apollo industry tag names for HVAC/mechanical trades
// These map to Apollo's internal industry taxonomy
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating & Air Conditioning',
  'Plumbing',
  'Mechanical or Industrial Engineering',
  'Construction',
  'Facilities Services',
];

// Decision-maker titles in priority order (Apollo searches these as OR conditions)
const TARGET_JOB_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

/**
 * Search Apollo for HVAC contacts.
 * Returns an array of normalized lead objects ready for the spreadsheet.
 *
 * @param {number} maxResults - Max contacts to return (default from env)
 * @returns {Promise<Array>}
 */
async function searchHVACLeads(maxResults = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10)) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY is not set in environment variables');
  }

  console.log(`[Apollo] Searching for up to ${maxResults} HVAC leads in Southwest Michigan...`);

  // Apollo's people search endpoint
  const url = `${APOLLO_BASE_URL}/mixed_people/search`;

  const payload = {
    api_key: apiKey,
    // Employee count filter: 1–25 employees (owner-operated)
    organization_num_employees_ranges: ['1,25'],
    // Location filter — Apollo accepts city+state strings
    person_locations: SW_MICHIGAN_CITIES,
    // Job title filter
    person_titles: TARGET_JOB_TITLES,
    // Industry keywords (Apollo uses q_keywords for free-text industry filter)
    q_organization_keyword_tags: TARGET_INDUSTRIES,
    // Only return contacts with a known phone number
    contact_phone_status_v2: ['likely_to_connect'],
    // Request the fields we need
    fields: [
      'first_name',
      'last_name',
      'title',
      'phone_numbers',
      'organization',
      'city',
      'state',
    ],
    per_page: Math.min(maxResults, 25), // Apollo max is 25 per page on free tier
    page: 1,
  };

  let allContacts = [];

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30000,
    });

    const data = response.data;

    if (!data || !data.people || data.people.length === 0) {
      console.log('[Apollo] Search returned 0 results.');
      return [];
    }

    console.log(`[Apollo] Retrieved ${data.people.length} contact(s) from API.`);

    allContacts = data.people
      .filter(person => hasUsablePhone(person))
      .map(normalizePerson)
      .slice(0, maxResults);

    console.log(`[Apollo] ${allContacts.length} contact(s) have usable phone numbers.`);
    return allContacts;

  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const body = JSON.stringify(err.response.data || {});
      throw new Error(`[Apollo] API error ${status}: ${body}`);
    }
    throw new Error(`[Apollo] Request failed: ${err.message}`);
  }
}

/** Returns true if the contact has at least one phone number */
function hasUsablePhone(person) {
  return (
    Array.isArray(person.phone_numbers) &&
    person.phone_numbers.length > 0 &&
    person.phone_numbers[0].sanitized_number
  );
}

/**
 * Pick the best phone number: prefer mobile, then direct, then any.
 * Returns the formatted number string.
 */
function pickBestPhone(phoneNumbers) {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) return '';

  const priority = ['mobile', 'direct', 'work_hq', 'other'];
  for (const type of priority) {
    const match = phoneNumbers.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  // Fallback: return whatever we have
  return phoneNumbers[0].sanitized_number || '';
}

/**
 * Flatten an Apollo person record into a flat lead object.
 */
function normalizePerson(person) {
  const org = person.organization || {};
  return {
    businessName: org.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: pickBestPhone(person.phone_numbers),
    city: person.city || org.city || '',
    website: (org.website_url || '').replace(/\/$/, ''), // strip trailing slash
  };
}

module.exports = { searchHVACLeads };
