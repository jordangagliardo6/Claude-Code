/**
 * Apollo.io API client
 *
 * Uses the v1 People Search endpoint to find HVAC company contacts.
 * Docs: https://apolloio.github.io/apollo-api-docs/?shell#mixed-people-search
 */

const axios = require('axios');
const config = require('./config');

const BASE_URL = 'https://api.apollo.io/v1';

/**
 * Search Apollo.io for HVAC leads in SW Michigan.
 * Returns an array of normalized lead objects ready to write to the sheet.
 *
 * @param {string} apiKey - APOLLO_API_KEY
 * @param {number} perPage - max results to request (capped by Apollo at 100)
 * @returns {Promise<Array>}
 */
async function searchHvacLeads(apiKey, perPage = 25) {
  const leads = [];

  // We rotate through cities so each run can hit a different subset
  // and Apollo's pagination can be used if needed.
  for (const city of config.SW_MICHIGAN_CITIES) {
    if (leads.length >= perPage) break;

    try {
      const response = await axios.post(
        `${BASE_URL}/mixed_people/search`,
        {
          api_key: apiKey,
          q_keywords: `${config.INDUSTRY_KEYWORDS} ${city}`,
          person_titles: config.TARGET_TITLES,
          organization_locations: ['Michigan, United States'],
          organization_num_employees_ranges: [config.EMPLOYEE_RANGE],
          per_page: Math.min(perPage - leads.length, 25),
          page: 1,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': apiKey,
          },
          timeout: 15000,
        }
      );

      const people = response.data?.people || [];

      for (const person of people) {
        if (leads.length >= perPage) break;

        // Skip contacts with no phone number
        const phone = extractPhone(person);
        if (!phone) continue;

        const org = person.organization || {};
        const cityName = extractCity(person, org);

        leads.push({
          businessName: org.name || '',
          firstName: person.first_name || '',
          lastName: person.last_name || '',
          phone,
          city: cityName,
          website: org.website_url || org.primary_domain || '',
        });
      }
    } catch (err) {
      // Surface the error to the caller — do not swallow it
      throw new Error(`Apollo search failed for "${city}": ${err.message}`);
    }
  }

  return leads;
}

/** Pull the best available phone number from a person record. */
function extractPhone(person) {
  if (person.phone_numbers && person.phone_numbers.length > 0) {
    // Prefer mobile, then direct, then any
    const mobile = person.phone_numbers.find((p) => p.type === 'mobile');
    const direct = person.phone_numbers.find((p) => p.type === 'direct');
    const any = person.phone_numbers[0];
    return (mobile || direct || any)?.raw_number || '';
  }
  return person.phone || '';
}

/** Pull city from person or organization record. */
function extractCity(person, org) {
  return (
    person.city ||
    org.city ||
    (person.location?.city) ||
    ''
  );
}

module.exports = { searchHvacLeads };
