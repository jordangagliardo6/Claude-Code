/**
 * Apollo.io API wrapper for HVAC lead searches in Southwest Michigan.
 *
 * Uses the /api/v1/mixed_people/search endpoint with your APOLLO_API_KEY.
 * Paid Apollo plans return phone numbers directly in search results.
 * Free plans may omit phone_numbers — you'll see empty phone fields if so.
 */

const axios = require('axios');

// Edit this list to add/remove target cities
const SW_MICHIGAN_CITIES = [
  'st. joseph', 'st joseph', 'benton harbor', 'kalamazoo', 'holland',
  'grand haven', 'muskegon', 'south haven', 'stevensville', 'paw paw',
  'watervliet', 'coloma', 'three rivers', 'mattawan', 'portage',
  'lawton', 'dowagiac', 'berrien springs', 'baroda', 'hartford',
  'plainwell', 'vicksburg', 'zeeland', 'douglas', 'fennville',
  'saugatuck', 'allegan', 'otsego'
];

// Industries to search — edit to broaden or narrow results
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Heating Cooling',
  'Air Conditioning'
];

// Job titles in priority order — Owner/Founder first
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager'
];

// NAICS 23822 = Plumbing, Heating, and Air-Conditioning Contractors
// SIC 1711  = Plumbing, Heating, and Air-Conditioning
const NAICS_CODES = ['23822'];
const SIC_CODES   = ['1711', '1731', '7623'];

/**
 * Search Apollo for HVAC owner/decision-maker contacts in SW Michigan.
 * Returns up to `maxLeads` results filtered to our target cities with phone numbers.
 *
 * @param {number} maxLeads  Maximum number of leads to return (default 25)
 * @returns {Promise<Array>} Array of lead objects matching our schema
 */
async function searchLeads(maxLeads = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY is not set in your .env file');
  }

  // We request extra results so we have room to filter city + phone
  const requestSize = Math.min(maxLeads * 3, 100);

  const payload = {
    api_key: apiKey,
    // Keyword search — helps catch HVAC companies that may not have SIC/NAICS tagged
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    // SIC/NAICS filters for more precision
    organization_naics_codes: NAICS_CODES,
    organization_sic_codes: SIC_CODES,
    // State-level location (Apollo maps city keywords to states; city filtering below)
    organization_locations: ['Michigan, United States'],
    person_locations: ['Michigan, United States'],
    // 1–25 employees = owner-operated small businesses
    organization_num_employees_ranges: ['1,10', '11,25'],
    // Decision-maker titles
    person_titles: TARGET_TITLES,
    include_similar_titles: false,
    // Sorted newest-first so we pull leads we haven't seen before
    per_page: requestSize,
    page: 1
  };

  let response;
  try {
    response = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/search',
      payload,
      { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' } }
    );
  } catch (err) {
    const status = err.response?.status;
    const body   = JSON.stringify(err.response?.data || {});
    throw new Error(`Apollo API request failed (HTTP ${status}): ${body}`);
  }

  const people = response.data?.people || [];

  if (people.length === 0) {
    console.log('Apollo returned 0 results. Check your API key tier and search filters.');
    return [];
  }

  // Filter to SW Michigan cities and contacts that have at least one phone number
  const filtered = people.filter(person => {
    const personCity = (person.city || '').toLowerCase();
    const orgCity    = (person.organization?.city || '').toLowerCase();
    const inSwMi     = SW_MICHIGAN_CITIES.some(
      c => personCity.includes(c) || orgCity.includes(c)
    );
    const hasPhone = Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0;
    return inSwMi && hasPhone;
  });

  // Map to our spreadsheet schema and cap at maxLeads
  return filtered.slice(0, maxLeads).map(person => ({
    businessName: person.organization?.name || '',
    firstName:    person.first_name || '',
    lastName:     person.last_name  || '',
    phone:        pickBestPhone(person.phone_numbers),
    city:         person.city || person.organization?.city || '',
    website:      person.organization?.website_url
                  || person.organization?.primary_domain
                  || ''
  }));
}

/**
 * Pick the best phone number: mobile > direct > any first result.
 */
function pickBestPhone(phoneNumbers) {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) return '';
  const mobile = phoneNumbers.find(p => p.type === 'mobile');
  const direct = phoneNumbers.find(p => p.type === 'direct');
  const chosen = mobile || direct || phoneNumbers[0];
  return chosen.sanitized_number || chosen.raw_number || '';
}

module.exports = { searchLeads, SW_MICHIGAN_CITIES, TARGET_TITLES };
