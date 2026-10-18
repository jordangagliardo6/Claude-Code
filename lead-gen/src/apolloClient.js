// Apollo.io REST API client
// Docs: https://apolloio.github.io/apollo-api-docs/

const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/api/v1';

// Builds a search payload for one city + the shared filters.
function buildSearchPayload(city, config, page = 1) {
  return {
    // Target decision-maker titles in priority order.
    person_titles: config.apollo.personTitles,

    // Include similar-sounding titles (e.g. "Business Owner" → "Owner").
    include_similar_titles: true,

    // Filter people whose employer is HQ'd in this city.
    organization_locations: [city],

    // Industry keywords matched against Apollo company tags.
    q_organization_keyword_tags: config.apollo.industryKeywords,

    // Company size: 1–25 employees.
    organization_num_employees_ranges: config.apollo.employeeRanges,

    // Michigan as the person's own location (catches remote/field workers too).
    person_locations: ['Michigan, United States'],

    per_page: config.apollo.pageSize,
    page,
  };
}

// Calls the Apollo People Search endpoint.
// Returns an array of raw person objects from the API.
async function searchPeople(city, config, page = 1) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  const payload = buildSearchPayload(city, config, page);

  const response = await axios.post(`${BASE_URL}/mixed_people/search`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'x-api-key': apiKey,
    },
    timeout: 30000,
  });

  return response.data;
}

// Extracts the best available phone number from a person record.
// Priority: mobile_phone > direct phone numbers > organization phone.
function extractPhone(person) {
  if (person.mobile_phone) return person.mobile_phone;

  if (Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0) {
    // Prefer numbers typed as 'mobile' or 'direct'.
    const preferred = person.phone_numbers.find(
      (p) => p.type === 'mobile' || p.type === 'direct'
    );
    return (preferred || person.phone_numbers[0]).raw_number || '';
  }

  // Fall back to the company's main line.
  return person.organization?.phone || '';
}

// Transforms a raw Apollo person record into the shape this workflow uses.
function normalizePerson(person) {
  const org = person.organization || {};
  return {
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    businessName: org.name || '',
    phone: extractPhone(person),
    city: org.city || person.city || '',
    website: org.website_url || org.primary_domain ? `https://${org.primary_domain}` : '',
  };
}

// Main entry point: search Apollo for HVAC leads across all configured cities.
// Returns an array of normalized lead objects, stopping once maxLeadsPerRun is reached.
async function fetchLeads(config) {
  const leads = [];
  const seen = new Set(); // deduplicate within a single run by business name

  for (const city of config.cities) {
    if (leads.length >= config.apollo.maxLeadsPerRun) break;

    let page = 1;
    let totalPages = 1;

    do {
      const data = await searchPeople(city, config, page);
      const people = data.people || [];
      totalPages = data.pagination?.total_pages ?? 1;

      for (const person of people) {
        if (leads.length >= config.apollo.maxLeadsPerRun) break;

        const lead = normalizePerson(person);

        // Skip contacts with no phone number.
        if (!lead.phone) continue;

        // Skip if we already picked up this business in this run.
        const key = lead.businessName.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);

        leads.push(lead);
      }

      page++;
    } while (page <= totalPages && leads.length < config.apollo.maxLeadsPerRun);
  }

  return leads;
}

module.exports = { fetchLeads };
