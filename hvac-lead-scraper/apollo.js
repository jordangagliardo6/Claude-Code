/**
 * apollo.js — Apollo.io REST API client.
 *
 * Uses the Apollo People Search + People Match (enrichment) endpoints.
 * API key is read from APOLLO_API_KEY env var.
 *
 * Apollo REST docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');
const config = require('./config');

const BASE_URL = 'https://api.apollo.io/v1';

/**
 * Search Apollo's global people database for HVAC decision-makers.
 * Returns raw Apollo person objects (names may be partially masked on free plan).
 */
async function searchPeople(apiKey) {
  const url = `${BASE_URL}/mixed_people/search`;

  const payload = {
    api_key: apiKey,
    page: 1,
    per_page: config.apolloPageSize,

    // Target job titles (Owner, President, Founder, Co-Founder, General Manager)
    person_titles: config.targetTitles,

    // Person must be located in Southwest Michigan
    person_locations: config.targetCities,

    // Company HQ must be in Michigan
    organization_locations: config.organizationLocations,

    // Small/owner-operated companies only (1–25 employees)
    organization_num_employees_ranges: config.employeeRanges,

    // Industry keywords matched against company tags
    q_organization_keyword_tags: config.industryKeywords,

    // SIC codes for HVAC/plumbing/mechanical
    organization_sic_codes: config.sicCodes,

    // Include similar titles (e.g. "Co-Owner" when "Owner" is listed)
    include_similar_titles: true,
  };

  const response = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    timeout: 15000,
  });

  return response.data.people || [];
}

/**
 * Enrich a single person by Apollo ID to reveal phone numbers.
 * Costs 1 enrichment credit per call. Only call this when the search
 * result doesn't already include a phone number.
 *
 * Returns the enriched person object, or null on failure.
 */
async function enrichPerson(apiKey, personId) {
  const url = `${BASE_URL}/people/match`;

  const response = await axios.post(url, {
    api_key: apiKey,
    id: personId,
    reveal_personal_emails: false,
    reveal_phone_number: true,
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  return response.data.person || null;
}

/**
 * Extract the best available phone number from a person object.
 * Preference order: mobile → direct → any → organization phone.
 */
function extractPhone(person) {
  const phones = person.phone_numbers || [];

  const mobile = phones.find(p => p.type === 'mobile' || p.type === 'personal_mobile');
  if (mobile?.sanitized_number) return mobile.sanitized_number;

  const direct = phones.find(p => p.type === 'direct' || p.type === 'work_direct');
  if (direct?.sanitized_number) return direct.sanitized_number;

  if (phones.length > 0 && phones[0].sanitized_number) {
    return phones[0].sanitized_number;
  }

  // Fall back to the company's main number
  const org = person.organization || person.account || {};
  return org.phone || '';
}

/**
 * Convert a raw Apollo person object into our clean lead format.
 */
function personToLead(person) {
  const org = person.organization || person.account || {};

  return {
    businessName:   org.name || '',
    ownerFirstName: person.first_name || '',
    ownerLastName:  person.last_name || '',
    phone:          extractPhone(person),
    city:           person.city || org.city || '',
    website:        org.website_url || (org.primary_domain ? `https://${org.primary_domain}` : ''),
  };
}

module.exports = { searchPeople, enrichPerson, personToLead, extractPhone };
