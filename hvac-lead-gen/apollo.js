/**
 * Apollo.io API wrapper for HVAC lead searches in Southwest Michigan.
 *
 * Apollo People Search docs: https://apolloio.github.io/apollo-api-docs/?shell#people-search
 */

const axios = require('axios');

// Southwest Michigan cities with their zip codes for location biasing
const SW_MICHIGAN_CITIES = [
  'St. Joseph',
  'Saint Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
  'Portage',
  'Battle Creek',
  'Allegan',
  'Douglas',
  'Saugatuck',
  'Paw Paw',
  'Niles',
  'Stevensville',
  'Bridgman',
  'Watervliet',
  'Coloma',
];

// Industry keywords Apollo uses for company categorization
const HVAC_INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Heating, Ventilation & Air Conditioning',
  'Air Conditioning and Heating',
];

// Decision-maker titles in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

/**
 * Search Apollo.io for HVAC contacts in Southwest Michigan.
 *
 * @param {number} maxResults - Max contacts to return (capped at 25 by default).
 * @returns {Promise<Array>} Normalized lead objects ready for the spreadsheet.
 */
async function searchHvacLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  // Build the people search payload
  // Apollo's API accepts both organization_industry_tag_ids and q_keywords; we use q_keywords
  // to search across company descriptions for HVAC/plumbing terms.
  const payload = {
    api_key: apiKey,
    page: 1,
    per_page: Math.min(maxResults * 2, 50), // Fetch extra to account for contacts with no phone
    person_titles: TARGET_TITLES,
    organization_locations: ['Michigan, United States'],
    organization_num_employees_ranges: ['1,25'],
    // Search HVAC-related keywords in company descriptions
    q_keywords: 'HVAC OR "heating and air" OR plumbing OR "mechanical contracting" OR "air conditioning"',
    // Only contacts that have a phone number of some kind
    contact_email_status_v2: [],
  };

  let response;
  try {
    response = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 30000,
      }
    );
  } catch (err) {
    if (err.response) {
      throw new Error(
        `Apollo API error ${err.response.status}: ${JSON.stringify(err.response.data)}`
      );
    }
    throw new Error(`Apollo request failed: ${err.message}`);
  }

  const people = response.data?.people ?? [];
  if (!people.length) {
    console.log('Apollo returned 0 contacts for this search.');
    return [];
  }

  console.log(`Apollo returned ${people.length} raw contacts — filtering...`);

  const leads = [];

  for (const person of people) {
    // Skip contacts with no phone number at all
    const phone = extractBestPhone(person);
    if (!phone) continue;

    // Filter to Southwest Michigan cities
    const city = person.city || person.organization?.city || '';
    if (!isSouthwestMichigan(city, person.state || person.organization?.state)) continue;

    leads.push({
      businessName: person.organization?.name || '',
      firstName: person.first_name || '',
      lastName: person.last_name || '',
      phone,
      city: city || '',
      website: person.organization?.website_url || '',
    });

    if (leads.length >= maxResults) break;
  }

  console.log(`Filtered down to ${leads.length} leads in Southwest Michigan with phone numbers.`);
  return leads;
}

/**
 * Return the best available phone number for a person.
 * Priority: mobile_phone > direct_phone > sanitized_phone.
 */
function extractBestPhone(person) {
  const mobile = person.mobile_phone;
  const direct = person.direct_phone_number;
  const sanitized = person.sanitized_phone;

  return mobile || direct || sanitized || null;
}

/**
 * Check whether a city/state combination falls within Southwest Michigan.
 * Apollo sometimes returns state as full name ("Michigan") or abbreviation ("MI").
 */
function isSouthwestMichigan(city, state) {
  if (!city && !state) return false;

  const stateMatch =
    state === 'Michigan' ||
    state === 'MI' ||
    state?.toLowerCase() === 'michigan';

  if (!stateMatch) return false;

  // Accept any Michigan contact when city is unknown — the Apollo org_location
  // filter already bounds us to Michigan; the city list is a best-effort refinement.
  if (!city) return true;

  return SW_MICHIGAN_CITIES.some(
    (c) => city.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(city.toLowerCase())
  );
}

module.exports = { searchHvacLeads, SW_MICHIGAN_CITIES };
