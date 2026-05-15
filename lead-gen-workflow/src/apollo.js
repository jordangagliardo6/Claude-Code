/**
 * Apollo.io API integration
 *
 * Searches for HVAC / mechanical trade contacts in Southwest Michigan
 * using Apollo's people search endpoint.
 *
 * Docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// ─── Target configuration (easy to modify) ────────────────────────────────────

// Cities and surrounding areas to search. Apollo accepts
// "City, State, Country" strings for person_locations.
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
  // Broader fallback so Apollo can include nearby suburbs
  'Berrien County, Michigan, United States',
  'Allegan County, Michigan, United States',
  'Ottawa County, Michigan, United States',
  'Muskegon County, Michigan, United States',
  'Van Buren County, Michigan, United States',
];

// Industries to include (Apollo matches these against company SIC/NAICS tags)
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating, Ventilation & Air Conditioning',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Facilities Services',
];

// Job titles in priority order. Apollo searches all of them;
// priority ordering is applied when we sort results below.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Employee count ranges Apollo accepts (inclusive string pairs)
const EMPLOYEE_RANGE = ['1,25'];

// ─── Title priority sort ──────────────────────────────────────────────────────

function titlePriority(title = '') {
  const t = title.toLowerCase();
  if (t.includes('owner')) return 0;
  if (t.includes('president')) return 1;
  if (t.includes('founder')) return 2;
  if (t.includes('general manager')) return 3;
  return 4;
}

// ─── Phone extraction ─────────────────────────────────────────────────────────

function extractPhone(person) {
  // Prefer mobile number, then any direct number, then org main line
  if (person.mobile_phone) return person.mobile_phone;

  const numbers = person.phone_numbers || [];
  const direct = numbers.find(n =>
    ['mobile', 'direct', 'work_hq'].includes(n.type?.toLowerCase())
  );
  if (direct?.sanitized_number) return direct.sanitized_number;
  if (numbers[0]?.sanitized_number) return numbers[0].sanitized_number;

  // Fall back to organization main phone
  return person.organization?.phone || '';
}

// ─── City extraction ──────────────────────────────────────────────────────────

function extractCity(person) {
  if (person.city) return person.city;
  if (person.organization?.city) return person.organization.city;

  const raw = person.present_raw_address || person.location || '';
  return raw.split(',')[0]?.trim() || '';
}

// ─── Main search function ─────────────────────────────────────────────────────

/**
 * Fetch up to `fetchCount` HVAC leads from Apollo.
 * Returns an array of lead objects sorted by title priority.
 *
 * We fetch more than `maxResults` because some may lack phone numbers
 * or be filtered out; the caller trims to the final count after
 * duplicate checking.
 *
 * @param {number} fetchCount  How many raw results to request (≤ 100)
 * @param {number} page        Pagination page (1-based)
 */
async function searchHVACLeads(fetchCount = 50, page = 1) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment');

  logger.info(`Apollo: requesting page ${page}, up to ${fetchCount} results`);

  const payload = {
    person_titles: TARGET_TITLES,
    person_locations: SW_MICHIGAN_LOCATIONS,
    q_organization_industries: TARGET_INDUSTRIES,
    organization_num_employees_ranges: EMPLOYEE_RANGE,
    // Only return contacts that have at least one phone number recorded
    contact_phone_status: ['verified'],
    page,
    per_page: Math.min(fetchCount, 100),
  };

  let response;
  try {
    response = await axios.post(
      `${APOLLO_BASE}/mixed_people/search`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
        timeout: 30_000,
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    throw new Error(`Apollo API request failed (HTTP ${status}): ${detail}`);
  }

  const people = response.data?.people || [];
  logger.info(`Apollo: received ${people.length} raw results`);

  if (people.length === 0) return [];

  // Map to our unified lead schema, filtering out anyone without a phone
  const leads = people
    .map(person => ({
      businessName: person.organization?.name?.trim() || '',
      firstName: person.first_name?.trim() || '',
      lastName: person.last_name?.trim() || '',
      phone: extractPhone(person),
      city: extractCity(person),
      website: person.organization?.website_url?.trim() || '',
      _titleRank: titlePriority(person.title),
    }))
    .filter(lead => lead.businessName && lead.phone);

  // Sort by job title priority so Owner/President contacts bubble up
  leads.sort((a, b) => a._titleRank - b._titleRank);

  // Remove internal sort key before returning
  leads.forEach(l => delete l._titleRank);

  logger.info(`Apollo: ${leads.length} leads have valid business name + phone`);
  return leads;
}

/**
 * Verify the Apollo API key is working.
 * Returns true on success, throws on failure.
 */
async function testConnection() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set');

  await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    { per_page: 1, page: 1 },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      timeout: 15_000,
    }
  );
  return true;
}

module.exports = { searchHVACLeads, testConnection };
