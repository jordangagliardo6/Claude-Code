/**
 * Apollo.io API helpers
 *
 * Uses the People Search endpoint to find HVAC decision-makers
 * in Southwest Michigan with phone numbers.
 *
 * API docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// Industries to target — Apollo normalises these to slugs internally
const TARGET_INDUSTRIES = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical and industrial engineering',
  'mechanical contracting',
];

// Job titles in priority order (Owner > President > Founder > Co-Founder > GM)
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Employee ranges: 1–25 (owner-operated small businesses)
const EMPLOYEE_RANGES = ['1,25'];

// SW Michigan cities — used for post-fetch filtering when Apollo returns wider results
const SW_MICHIGAN_CITIES = [
  'st. joseph', 'saint joseph', 'benton harbor', 'kalamazoo', 'holland',
  'grand haven', 'muskegon', 'south haven', 'stevensville', 'paw paw',
  'watervliet', 'coloma', 'baroda', 'berrien springs', 'dowagiac', 'hartford',
  'lawrence', 'lawton', 'three rivers', 'mattawan', 'portage', 'vicksburg',
  'plainwell', 'zeeland', 'grand junction', 'covert', 'lacota',
];

/**
 * Search Apollo for HVAC decision-makers in SW Michigan.
 *
 * @param {string} apiKey  - APOLLO_API_KEY from env
 * @param {number} page    - 1-indexed page number
 * @param {number} perPage - results per page (max 25 on free plan, 100 on paid)
 * @returns {Promise<{ contacts: ApolloContact[], totalEntries: number }>}
 */
async function searchHvacLeads(apiKey, page = 1, perPage = 25) {
  const payload = {
    api_key: apiKey,
    // Location: Michigan state, US
    q_organization_locations: ['Michigan, United States'],
    // Target industries
    q_organization_industries: TARGET_INDUSTRIES,
    // Company size: 1–25 employees
    organization_num_employees_ranges: EMPLOYEE_RANGES,
    // Target titles (priority order built into Apollo's ranking)
    person_titles: TARGET_TITLES,
    // Only return contacts with a phone number
    contact_has_phone: true,
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
      timeout: 30_000,
    }
  );

  const data = response.data;
  const rawContacts = data.people || [];
  const totalEntries = data.pagination?.total_entries ?? rawContacts.length;

  // Map to a clean, flat structure matching the spreadsheet columns
  const contacts = rawContacts.map(normaliseContact).filter(Boolean);

  return { contacts, totalEntries };
}

/**
 * Normalise a raw Apollo contact record into the spreadsheet row shape.
 * Returns null if the contact lacks a phone number (safety net).
 *
 * @param {object} person - Raw Apollo people record
 * @returns {Lead|null}
 */
function normaliseContact(person) {
  const org = person.organization ?? {};

  // Extract the best available phone number
  const phone =
    person.mobile_phone ||
    person.phone_number ||
    (person.phone_numbers && person.phone_numbers[0]?.sanitized_number) ||
    null;

  if (!phone) return null;

  const city = (
    person.city ||
    org.city ||
    person.present_raw_address?.split(',')[0] ||
    ''
  ).trim();

  return {
    businessName: org.name || person.organization_name || '',
    ownerFirstName: person.first_name || '',
    ownerLastName: person.last_name || '',
    phoneNumber: formatPhone(phone),
    city,
    website: org.website_url || '',
    // Lowercase city used only for dedup/filtering — not written to sheet
    cityNorm: city.toLowerCase(),
  };
}

/**
 * Format a raw phone number to (XXX) XXX-XXXX style.
 * Passes through any string that doesn't look like a 10-digit US number.
 */
function formatPhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw; // return as-is if format is unexpected
}

/**
 * Optional city filter: returns true if the contact's city is in SW Michigan.
 * Apollo's location filter already narrows to Michigan, but sometimes returns
 * cities elsewhere in the state. Enable this if you want strict SW MI only.
 *
 * @param {Lead} lead
 * @returns {boolean}
 */
function isInSwMichigan(lead) {
  return SW_MICHIGAN_CITIES.some(c => lead.cityNorm.includes(c));
}

module.exports = { searchHvacLeads, isInSwMichigan, SW_MICHIGAN_CITIES };
