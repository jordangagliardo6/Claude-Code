/**
 * Apollo.io API integration
 * Searches for HVAC leads in Southwest Michigan based on configured filters
 */

const axios = require('axios');

// Southwest Michigan cities to target
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

// Industries that map to HVAC / mechanical services in Apollo
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
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
 * Searches Apollo.io for HVAC leads matching our criteria.
 * Returns an array of normalized lead objects.
 *
 * Apollo v1 people search docs:
 * https://apolloio.github.io/apollo-api-docs/?shell#search-for-people
 */
async function searchLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const url = 'https://api.apollo.io/v1/mixed_people/search';

  // Build the request payload following Apollo's search schema
  const payload = {
    api_key: apiKey,
    page: 1,
    per_page: maxResults,

    // Geography — state-level with city bias
    person_locations: TARGET_CITIES.map((city) => `${city}, Michigan, United States`),

    // Company filters
    organization_locations: ['Michigan, United States'],
    organization_num_employees_ranges: ['1,25'],

    // Industries — Apollo uses "organization_industry_tag_ids" or plain keyword search
    // We use "q_organization_industry_keywords" for broad matching
    q_organization_industry_keywords: TARGET_INDUSTRIES.join(' OR '),

    // Target job titles (Apollo accepts an array for OR matching)
    person_titles: TARGET_TITLES,

    // Only return contacts that have a phone number
    contact_email_status: [],
    has_phone: true,

    // Fields to return
    prospect_id_fields: [
      'name',
      'first_name',
      'last_name',
      'title',
      'phone_numbers',
      'city',
      'organization_name',
      'organization',
      'account',
    ],
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30000,
    });

    const { people, pagination } = response.data;
    if (!Array.isArray(people) || people.length === 0) {
      return [];
    }

    console.log(
      `[Apollo] Found ${people.length} contacts (page 1 of ${Math.ceil((pagination?.total_entries || people.length) / maxResults)})`
    );

    return people.map(normalizeLead).filter(Boolean);
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    throw new Error(`Apollo API error (HTTP ${status || 'N/A'}): ${detail}`);
  }
}

/**
 * Converts a raw Apollo person record into the flat shape we store in the sheet.
 * Returns null if the record is missing required fields (name + phone).
 */
function normalizeLead(person) {
  const firstName = person.first_name || '';
  const lastName = person.last_name || '';
  const businessName =
    person.organization_name ||
    person.organization?.name ||
    person.account?.name ||
    '';

  // Prefer mobile > direct > any available number
  const phones = Array.isArray(person.phone_numbers) ? person.phone_numbers : [];
  const phone =
    phones.find((p) => p.type === 'mobile')?.sanitized_number ||
    phones.find((p) => p.type === 'direct')?.sanitized_number ||
    phones[0]?.sanitized_number ||
    '';

  // Skip contacts without a usable phone
  if (!phone) return null;
  // Skip contacts without a business name (can't deduplicate)
  if (!businessName) return null;

  const city = person.city || '';
  const website =
    person.organization?.website_url ||
    person.account?.website_url ||
    '';

  return {
    businessName: businessName.trim(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone: phone.trim(),
    city: city.trim(),
    website: website.trim(),
  };
}

module.exports = { searchLeads, TARGET_CITIES, TARGET_INDUSTRIES, TARGET_TITLES };
