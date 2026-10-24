/**
 * apollo.js
 * Handles all Apollo.io People Search API calls.
 * Searches for HVAC decision-makers in Southwest Michigan.
 */

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// Apollo employee range format: "min,max"
const EMPLOYEE_RANGE = ['1,25'];

/**
 * Fetch leads from Apollo.io for a single city.
 * Returns an array of normalized lead objects.
 *
 * @param {string} city - e.g. "Kalamazoo, Michigan"
 * @param {number} perPage - max results for this city slice
 */
async function fetchLeadsForCity(city, perPage = 5) {
  const payload = {
    api_key: config.APOLLO_API_KEY,
    // Target job titles in priority order
    person_titles: config.TARGET_TITLES,
    // Filter by organization location
    organization_locations: [city],
    // Small/owner-operated businesses only
    organization_num_employees_ranges: EMPLOYEE_RANGE,
    // Only return contacts who have a phone number
    prospected_by_current_team: ['yes', 'no'],
    // Industry keyword filter (comma-joined for Apollo keyword search)
    q_keywords: config.INDUSTRIES.join(' OR '),
    page: 1,
    per_page: perPage,
  };

  const response = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': config.APOLLO_API_KEY,
      },
      timeout: 30000,
    }
  );

  const people = response.data?.people || [];
  return people
    .filter(hasPhone)
    .map(normalizePerson);
}

/**
 * Fetch up to MAX_LEADS_PER_RUN leads spread across all configured cities.
 * Distributes the quota evenly and de-dupes by business name before returning.
 */
async function fetchLeads() {
  const { CITIES, MAX_LEADS_PER_RUN } = config;
  const perCity = Math.ceil(MAX_LEADS_PER_RUN / CITIES.length);
  const allLeads = [];
  const seenBusinesses = new Set();

  for (const city of CITIES) {
    try {
      console.log(`  Querying Apollo for "${city}"...`);
      const leads = await fetchLeadsForCity(city, perCity);
      for (const lead of leads) {
        if (!seenBusinesses.has(lead.businessName.toLowerCase())) {
          seenBusinesses.add(lead.businessName.toLowerCase());
          allLeads.push(lead);
        }
      }
      // Polite delay between API calls to avoid rate-limiting
      await sleep(1000);
    } catch (err) {
      console.error(`  Apollo error for "${city}": ${err.message}`);
      // Continue with remaining cities instead of aborting the whole run
    }
  }

  return allLeads.slice(0, MAX_LEADS_PER_RUN);
}

// --- helpers ---

function hasPhone(person) {
  return (
    person.sanitized_phone ||
    person.phone_numbers?.length > 0 ||
    person.organization?.phone
  );
}

function normalizePerson(person) {
  const phone =
    person.sanitized_phone ||
    person.phone_numbers?.[0]?.sanitized_number ||
    person.organization?.phone ||
    '';

  const city =
    person.city ||
    person.organization?.city ||
    '';

  const state =
    person.state ||
    person.organization?.state ||
    '';

  const cityDisplay = city && state ? `${city}, ${state}` : city || state;

  return {
    businessName: person.organization?.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: phone.trim(),
    city: cityDisplay,
    website: person.organization?.website_url || '',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { fetchLeads };
