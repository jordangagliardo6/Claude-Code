/**
 * apollo.js — Apollo.io People Search API integration.
 *
 * Uses the v1 mixed_people/search endpoint to find HVAC decision-makers
 * in Southwest Michigan. Returns only contacts that have a phone number.
 *
 * Docs: https://apolloio.github.io/apollo-api-docs/?shell#people-search-api
 */

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

/**
 * Searches Apollo for up to `limit` people across all target cities.
 * Iterates city by city and merges results, stopping once the limit is hit.
 *
 * @param {number} limit  Max total leads to return
 * @returns {Promise<Array>} Normalized lead objects
 */
async function searchLeads(limit) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const leads = [];
  const seenOrgIds = new Set();

  for (const city of config.targetCities) {
    if (leads.length >= limit) break;

    const remaining = limit - leads.length;
    const results = await searchCity(apiKey, city, remaining);

    for (const person of results) {
      if (leads.length >= limit) break;
      // Dedupe within this run by Apollo org ID
      const orgId = person.organization_id || person.id;
      if (seenOrgIds.has(orgId)) continue;
      seenOrgIds.add(orgId);

      const normalized = normalizePerson(person, city);
      if (normalized) leads.push(normalized);
    }
  }

  return leads;
}

/**
 * Fires one Apollo People Search request for a single city.
 *
 * @param {string} apiKey
 * @param {string} city       e.g. "St. Joseph, Michigan"
 * @param {number} perPage    How many results to request
 * @returns {Promise<Array>}  Raw Apollo person objects
 */
async function searchCity(apiKey, city, perPage) {
  const payload = {
    api_key: apiKey,
    page: 1,
    per_page: Math.min(perPage * 3, 100), // fetch extras to absorb no-phone drops
    person_locations: [city],
    organization_locations: [city],
    person_titles: config.targetTitles,
    include_similar_titles: true,
    organization_num_employees_ranges: [config.employeeRange],
    q_organization_keyword_tags: config.industryKeywords,
    // Request contact phone numbers in results
    contact_email_status: [], // not filtering by email
  };

  try {
    const resp = await axios.post(
      `${APOLLO_BASE}/mixed_people/search`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 15000,
      }
    );

    const people = resp.data?.people || [];
    return people;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error || err.message;
    throw new Error(`Apollo API error for city "${city}" [HTTP ${status}]: ${msg}`);
  }
}

/**
 * Normalizes a raw Apollo person object into the shape we write to Sheets.
 * Returns null if there is no usable phone number (we skip those).
 *
 * @param {Object} person   Raw Apollo person
 * @param {string} city     City context (fallback if Apollo city is blank)
 * @returns {Object|null}
 */
function normalizePerson(person, city) {
  // Prefer direct/mobile phone; fall back to sanitized_phone
  const phone =
    person.phone_numbers?.find((p) => p.type === 'mobile' || p.type === 'direct')
      ?.sanitized_number ||
    person.sanitized_phone ||
    person.phone_numbers?.[0]?.sanitized_number ||
    null;

  if (!phone) return null; // Skip contacts without a phone number

  const org = person.organization || {};

  return {
    businessName:
      org.name || person.employment_history?.[0]?.organization_name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone,
    city:
      person.city ||
      person.present_raw_address?.split(',')[0]?.trim() ||
      city.split(',')[0],
    website: org.website_url || org.domain ? `https://${org.domain}` : '',
  };
}

module.exports = { searchLeads };
