/**
 * Apollo.io People Search
 *
 * Searches for owner-operated HVAC/Plumbing/Mechanical businesses
 * in Southwest Michigan using the Apollo REST API v1.
 *
 * Docs: https://apolloio.github.io/apollo-api-docs/?shell#people-api
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// ── Target geography ──────────────────────────────────────────────────────────
// Add or remove cities here to change where leads are pulled from.
const TARGET_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// ── Industry keywords ─────────────────────────────────────────────────────────
// Apollo matches these against company tags and descriptions.
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating cooling',
  'air conditioning',
];

// ── Job titles — priority order (Owner first) ─────────────────────────────────
// The API returns matches in relevance order; we re-sort by this priority below.
const TITLE_PRIORITY = ['owner', 'president', 'founder', 'co-founder', 'general manager'];

// SIC 1711 = Plumbing, Heating, Air-Conditioning Contractors
const SIC_CODES = ['1711'];

/**
 * Search Apollo for HVAC leads in SW Michigan.
 *
 * @param {number} page     - Page number (1-indexed)
 * @param {number} perPage  - Results per page (max 100)
 * @returns {{ leads: Lead[], totalCount: number }}
 */
async function searchLeads(page = 1, perPage = 100) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const payload = {
    api_key: apiKey,
    organization_locations: TARGET_CITIES,
    organization_num_employees_ranges: ['1,25'],   // 1–25 employees only
    person_titles: TITLE_PRIORITY,
    include_similar_titles: true,                  // catch "co-owner", "managing partner", etc.
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    organization_sic_codes: SIC_CODES,
    person_seniorities: ['owner', 'c_suite'],      // additional seniority filter
    page,
    per_page: perPage,
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      timeout: 30_000,
    });
  } catch (err) {
    if (err.response) {
      const { status, data } = err.response;
      throw new Error(`Apollo API ${status}: ${data?.message || err.response.statusText}`);
    }
    throw err;
  }

  const people = response.data?.people || [];
  const totalCount = response.data?.pagination?.total_entries || 0;

  // Keep only contacts that have at least one phone number
  const withPhone = people.filter(p => p.phone_numbers?.length > 0);

  // Map to a clean lead object and sort by title priority
  const leads = withPhone
    .map(mapPersonToLead)
    .sort(byTitlePriority);

  return { leads, totalCount };
}

/**
 * Map a raw Apollo person object to our lead shape.
 */
function mapPersonToLead(person) {
  const org = person.organization || {};
  const phone = pickBestPhone(person.phone_numbers || []);
  const city = person.city || org.city || '';
  const website =
    org.website_url ||
    (org.primary_domain ? `https://${org.primary_domain}` : '') ||
    '';

  return {
    businessName: (org.name || '').trim(),
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone,
    city,
    website,
    titleRaw: (person.title || '').toLowerCase(), // used for sorting only
  };
}

/**
 * Choose the best phone number from the list.
 * Priority: mobile > direct_dial > work > any other type.
 */
function pickBestPhone(phoneNumbers) {
  const priority = ['mobile', 'direct_dial', 'work'];
  for (const type of priority) {
    const match = phoneNumbers.find(p => p.type === type);
    if (match) return match.sanitized_number || match.raw_number || '';
  }
  // Fallback: first available number
  return phoneNumbers[0]?.sanitized_number || phoneNumbers[0]?.raw_number || '';
}

/**
 * Sort leads so Owner/President come before General Manager, etc.
 */
function byTitlePriority(a, b) {
  const scoreOf = title => {
    const idx = TITLE_PRIORITY.findIndex(t => title.includes(t));
    return idx === -1 ? TITLE_PRIORITY.length : idx;
  };
  return scoreOf(a.titleRaw) - scoreOf(b.titleRaw);
}

module.exports = { searchLeads, TARGET_CITIES, TITLE_PRIORITY };
