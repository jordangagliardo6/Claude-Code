// Apollo.io API integration
// Docs: https://apolloio.github.io/apollo-api-docs/

const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

const BASE_URL = config.apollo.baseUrl;
const API_KEY  = process.env.APOLLO_API_KEY;

// Verify the API key is set and that Apollo accepts it
async function testConnection() {
  if (!API_KEY) throw new Error('APOLLO_API_KEY environment variable is not set.');

  const res = await axios.get(`${BASE_URL}/auth/health`, {
    headers: { 'X-Api-Key': API_KEY, 'Cache-Control': 'no-cache' },
  });

  if (res.status !== 200) throw new Error(`Apollo health check returned HTTP ${res.status}`);
  logger.success('Apollo.io connection verified.');
  return true;
}

// Build the search payload for one city.
// We iterate per city so that city-level results are accurate;
// Apollo's location filter is fuzzy at the state level.
function buildSearchPayload(city, page = 1) {
  return {
    api_key: API_KEY,
    page,
    per_page: 25,
    person_titles: config.apollo.jobTitles,
    // organization_industry_tag_values accepts plain-text industry names
    q_organization_industry_tag_values: config.apollo.industries,
    organization_num_employees_ranges: config.apollo.employeeRanges,
    // person_locations targets the contact's listed city/state
    person_locations: [city],
    // Fallback: also match org HQ in Michigan to catch remote contacts
    organization_locations: [config.apollo.stateLocation],
    // Only return contacts Apollo has a phone number for
    contact_phone_number_status: ['verified', 'likely_to_connect'],
  };
}

// Normalize a raw Apollo person record into our standard lead shape.
// Returns null if the record lacks a usable phone number or company name.
function normalizeLead(person) {
  const companyName = person.organization?.name || person.account?.name;
  if (!companyName) return null;

  // Prefer mobile → direct → first available phone
  const phones = person.phone_numbers || [];
  const mobile  = phones.find((p) => p.type === 'mobile');
  const direct  = phones.find((p) => p.type === 'direct');
  const anyPhone = mobile || direct || phones[0];

  if (!anyPhone) return null; // respect "exclude contacts with no phone"

  // City: prefer the person's listed city, fall back to org city
  const city =
    person.city ||
    person.organization?.city ||
    person.account?.organization_city ||
    '';

  // Website: strip trailing slashes for cleanliness
  const website =
    person.organization?.website_url ||
    person.account?.domain ||
    '';

  return {
    companyName,
    firstName: person.first_name || '',
    lastName:  person.last_name  || '',
    phone:     anyPhone.sanitized_number || anyPhone.raw_number || '',
    city,
    website,
  };
}

// Search Apollo for leads matching one city.
// Returns an array of normalized lead objects (may be empty).
async function searchCity(city) {
  const payload = buildSearchPayload(city);

  logger.info(`Apollo search → ${city}`);

  let res;
  try {
    res = await axios.post(`${BASE_URL}/mixed_people/search`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': API_KEY,
      },
      timeout: 30_000,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;
    throw new Error(`Apollo API error for "${city}" (HTTP ${status}): ${detail}`);
  }

  const people = res.data?.people || [];
  logger.info(`  → ${people.length} raw result(s) for ${city}`);

  const leads = [];
  for (const person of people) {
    const lead = normalizeLead(person);
    if (lead) leads.push(lead);
  }

  logger.info(`  → ${leads.length} usable lead(s) after filtering`);
  return leads;
}

// Search all configured cities and return a deduplicated flat list.
// Stops early once we have reached maxLeadsPerRun across all cities.
async function fetchLeads(maxLeads = config.apollo.maxLeadsPerRun) {
  if (!API_KEY) throw new Error('APOLLO_API_KEY environment variable is not set.');

  const seen    = new Set(); // dedupe by company name within this run
  const results = [];

  for (const city of config.apollo.targetCities) {
    if (results.length >= maxLeads) break;

    let cityLeads;
    try {
      cityLeads = await searchCity(city);
    } catch (err) {
      logger.error(err.message);
      continue; // skip this city but keep going with others
    }

    for (const lead of cityLeads) {
      if (results.length >= maxLeads) break;
      const key = lead.companyName.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push(lead);
      }
    }
  }

  logger.info(`Apollo total: ${results.length} unique lead(s) collected`);
  return results;
}

module.exports = { fetchLeads, testConnection };
