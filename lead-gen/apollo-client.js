/**
 * Apollo.io API client for HVAC lead prospecting.
 * Uses the REST API directly with an API key (not OAuth).
 * Docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// Southwest Michigan target cities (modify this list to expand coverage)
const TARGET_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Job titles in priority order (Apollo returns results matching any of these)
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// HVAC industry keywords for organization filtering
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Heating & Cooling',
];

// NAICS code for Plumbing, Heating, and Air-Conditioning Contractors
const HVAC_NAICS_CODES = ['238220'];

/**
 * Search Apollo for HVAC owner/decision-makers in Southwest Michigan.
 * Returns an array of raw Apollo person objects.
 */
async function searchHvacLeads(apiKey, page = 1, perPage = 50) {
  const payload = {
    api_key: apiKey,
    page,
    per_page: perPage,
    person_titles: TARGET_TITLES,
    person_locations: TARGET_CITIES,
    organization_locations: ['Michigan, United States'],
    organization_num_employees_ranges: ['1,25'],
    organization_naics_codes: HVAC_NAICS_CODES,
    // Include similar titles (e.g. "co-owner") so we don't miss leads
    include_similar_titles: true,
    // Request that phone numbers are returned where available
    reveal_personal_emails: false,
    // Sort by most recently updated so we get fresh data first
    sort_by_field: 'contact_updated_at',
    sort_ascending: false,
  };

  const response = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/search`,
    payload,
    {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      timeout: 30000,
    }
  );

  if (response.data && response.data.people) {
    return {
      people: response.data.people,
      pagination: response.data.pagination || {},
      totalEntries: response.data.pagination?.total_entries || 0,
    };
  }

  throw new Error(`Unexpected Apollo response shape: ${JSON.stringify(response.data).slice(0, 200)}`);
}

/**
 * Enrich a batch of people by Apollo ID to reveal phone numbers.
 * Apollo charges credits for enrichment — this is called only when
 * the search result does not already contain usable phone numbers.
 *
 * Returns a map of { apolloId -> enrichedPerson }.
 */
async function enrichPeopleBatch(apiKey, apolloIds) {
  if (!apolloIds.length) return {};

  const details = apolloIds.map((id) => ({ id }));

  const response = await axios.post(
    `${APOLLO_BASE_URL}/people/bulk_match`,
    { api_key: apiKey, details, reveal_personal_emails: false },
    {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      timeout: 30000,
    }
  );

  const enriched = {};
  if (response.data && response.data.matches) {
    for (const match of response.data.matches) {
      if (match && match.id) {
        enriched[match.id] = match;
      }
    }
  }
  return enriched;
}

/**
 * Extract the best available phone number from a person object.
 * Prefers: direct > mobile > work > any
 * Returns null if no phone number is found.
 */
function extractBestPhone(person) {
  const phones = person.phone_numbers || [];
  if (!phones.length) return null;

  const priority = ['direct', 'mobile', 'work'];
  for (const type of priority) {
    const match = phones.find((p) => p.type === type && p.raw_number);
    if (match) return match.raw_number;
  }

  // Fallback: take the first available number
  const first = phones.find((p) => p.raw_number);
  return first ? first.raw_number : null;
}

/**
 * Normalize a person from the Apollo search response into a flat lead object.
 * Returns null if the person lacks required fields (business name, phone).
 */
function normalizeLead(person) {
  const orgName = person.organization?.name || person.employment_history?.[0]?.organization_name;
  if (!orgName) return null;

  const phone = extractBestPhone(person);
  // We don't skip null phones here — the caller decides based on filter policy.

  const website =
    person.organization?.website_url ||
    person.organization?.primary_domain
      ? `https://${person.organization.primary_domain}`
      : null;

  return {
    apolloId: person.id,
    businessName: orgName.trim(),
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: phone || '',
    city: person.city || person.organization?.city || '',
    website: website || '',
    title: person.title || '',
  };
}

module.exports = {
  searchHvacLeads,
  enrichPeopleBatch,
  normalizeLead,
  extractBestPhone,
  TARGET_CITIES,
  TARGET_TITLES,
};
