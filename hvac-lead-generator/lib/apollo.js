/**
 * Apollo.io People Search API integration.
 *
 * Docs: https://apolloio.github.io/apollo-api-docs/
 * Endpoint: POST /v1/mixed_people/search
 */

const axios = require('axios');
const config = require('../config');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

/**
 * Search Apollo for HVAC contacts in Southwest Michigan.
 * Returns an array of normalized lead objects.
 */
async function fetchLeads() {
  if (!config.apollo.apiKey) {
    throw new Error('APOLLO_API_KEY is not set in environment variables.');
  }

  const payload = {
    q_keywords: config.apollo.industryKeywords,

    // Location targeting: state-level + city names as person locations
    person_locations: ['Michigan, United States'],

    // Restrict organizations to Michigan as well
    organization_locations: ['Michigan, United States'],

    // Only people with these titles
    person_titles: config.apollo.targetTitles,

    // 1–25 employees (owner-operated)
    organization_num_employees_ranges: [config.apollo.employeeRange],

    // Only return contacts that have a phone number
    contact_phone_exists: true,

    per_page: config.apollo.maxLeadsPerRun,
    page: 1,
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE_URL}/mixed_people/search`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': config.apollo.apiKey,
      },
      timeout: 30000,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    throw new Error(`Apollo API request failed (HTTP ${status}): ${detail}`);
  }

  const people = response.data?.people || [];

  if (people.length === 0) {
    return [];
  }

  // Normalize each contact into a flat lead object
  return people
    .map(normalizeContact)
    .filter(lead => {
      // Drop contacts with no phone (belt-and-suspenders guard)
      if (!lead.phone) return false;
      // Soft-filter: keep only contacts whose city appears in our target list
      // Apollo doesn't always return exact city matches, so this is advisory
      const targetCities = config.apollo.cities.map(c => c.split(',')[0].toLowerCase());
      if (lead.city) {
        const leadCity = lead.city.toLowerCase();
        // Accept if city matches OR if it's just "Michigan" (we'll keep it)
        return targetCities.some(c => leadCity.includes(c)) || leadCity.includes('michigan');
      }
      return true; // keep if city is unknown — better to over-include
    });
}

/**
 * Map an Apollo person object to the shape we need.
 * Edit this function if Apollo's response schema changes.
 */
function normalizeContact(person) {
  const org = person.organization || {};

  // Pick the best available phone number
  const phones = person.phone_numbers || [];
  const mobilePhone = phones.find(p => p.type === 'mobile');
  const directPhone = phones.find(p => p.type === 'direct');
  const anyPhone = phones[0];
  const bestPhone = mobilePhone || directPhone || anyPhone;

  return {
    businessName: org.name || person.organization_name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: bestPhone ? bestPhone.sanitized_number || bestPhone.raw_number || '' : '',
    city: person.city || org.city || '',
    website: org.website_url || '',
  };
}

module.exports = { fetchLeads };
