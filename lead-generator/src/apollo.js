const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// ─── Configurable Search Parameters ──────────────────────────────────────────
// Edit TARGET_CITIES to add or remove Southwest Michigan locations
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven'
];

// Job titles to target, in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager'
];

// Apollo keyword tags for HVAC-adjacent industries
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Air Conditioning',
  'Heating and Cooling'
];

// SIC codes: 1711 = Plumbing, Heating, A/C; 7623 = Refrigeration & Heating Repair
const SIC_CODES = ['1711', '7623'];

// NAICS 238220 = Plumbing, Heating, and Air-Conditioning Contractors
const NAICS_CODES = ['23822'];
// ─────────────────────────────────────────────────────────────────────────────

function createClient() {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }

  return axios.create({
    baseURL: APOLLO_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.APOLLO_API_KEY,
      'Cache-Control': 'no-cache'
    },
    timeout: 30000
  });
}

// Searches Apollo for HVAC decision-makers in Michigan.
// Returns the raw API response (pagination + people array).
async function searchPeople(page = 1, perPage = 100) {
  const client = createClient();

  const payload = {
    page,
    per_page: perPage,
    // Job titles (exact match only — avoids unrelated senior roles)
    person_titles: TARGET_TITLES,
    include_similar_titles: false,
    // Broad Michigan location — we city-filter in code for flexibility
    organization_locations: ['Michigan, United States'],
    // Owner-operated small businesses only (1–25 employees)
    organization_num_employees_ranges: ['1,25'],
    // Industry signals: keywords OR SIC/NAICS codes
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    organization_sic_codes: SIC_CODES,
    organization_naics_codes: NAICS_CODES
  };

  logger.info(`Querying Apollo — page ${page}, ${perPage} results requested`);

  const response = await client.post('/mixed_people/search', payload);
  return response.data;
}

// Extracts the best available phone number from a person record.
// Apollo may return masked numbers without enrichment credits.
function extractPhone(person) {
  if (Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0) {
    // Prefer mobile → direct → any available
    const preferred = ['mobile', 'direct_phone', 'work', 'other'];
    for (const type of preferred) {
      const found = person.phone_numbers.find(p => p.type === type && p.sanitized_number);
      if (found) return found.sanitized_number;
    }
    const any = person.phone_numbers.find(p => p.sanitized_number);
    if (any) return any.sanitized_number;
  }

  // Fall back to the company's main phone
  if (person.organization?.phone) {
    return person.organization.phone;
  }

  return null;
}

// Returns true if the person's city (or their org's city) is in our target area.
function isInTargetArea(person) {
  const city = (person.city || '').toLowerCase();
  const orgCity = (person.organization?.city || '').toLowerCase();

  return TARGET_CITIES.some(
    t => city.includes(t.toLowerCase()) || orgCity.includes(t.toLowerCase())
  );
}

// Converts a raw Apollo person object into a clean lead record.
function formatLead(person) {
  const phone = extractPhone(person);
  const orgName = person.organization_name || person.organization?.name || '';
  const city = person.city || person.organization?.city || '';
  const website = person.organization?.website_url || '';

  return {
    businessName: orgName.trim(),
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone: phone || '',
    city: city.trim(),
    website: website.trim(),
    hasPhone: !!phone
  };
}

// Fetches one page of Apollo results and returns formatted leads that:
//   • are in the Southwest Michigan target area
//   • have at least one phone number
async function fetchQualifiedLeads(page = 1) {
  const data = await searchPeople(page, 100);
  const people = data.people || [];

  logger.info(`Apollo returned ${people.length} people on page ${page} (${data.pagination?.total_entries ?? '?'} total matches)`);

  const qualified = people
    .filter(p => isInTargetArea(p))
    .map(formatLead)
    .filter(lead => lead.hasPhone && lead.businessName);

  logger.info(`Qualified (city + phone + name): ${qualified.length}`);
  return { leads: qualified, totalEntries: data.pagination?.total_entries || 0 };
}

// Lightweight call to verify the API key works.
async function testApolloConnection() {
  try {
    if (!process.env.APOLLO_API_KEY) {
      console.error('  ❌ APOLLO_API_KEY is not set in .env');
      return false;
    }

    const client = createClient();
    const response = await client.get('/users/api_profile');
    const user = response.data?.user;
    console.log(`  ✅ Apollo connected — account: ${user?.name || user?.email || 'unknown'}`);
    return true;
  } catch (err) {
    const status = err.response?.status ?? 'network error';
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`  ❌ Apollo connection failed (HTTP ${status}): ${detail}`);
    return false;
  }
}

module.exports = {
  fetchQualifiedLeads,
  testApolloConnection,
  TARGET_CITIES
};
