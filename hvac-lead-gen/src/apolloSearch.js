const axios = require('axios');
const { config } = require('./config');
const logger = require('./logger');

const client = axios.create({
  baseURL: config.apollo.baseUrl,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': config.apollo.apiKey,
  },
  timeout: 30000,
});

/**
 * Scores a contact's job title against the priority list.
 * Lower score = higher priority (Owner = 0, General Manager = 4).
 */
function titleScore(title) {
  if (!title) return 99;
  const t = title.toLowerCase();
  const priorities = ['owner', 'president', 'founder', 'co-founder', 'general manager'];
  const idx = priorities.findIndex((p) => t.includes(p));
  return idx === -1 ? 99 : idx;
}

/**
 * Extracts the best available phone number from an Apollo person record.
 * Prefers direct/mobile numbers over main company lines.
 */
function extractPhone(person) {
  // Apollo returns phone_numbers as an array of { raw_number, type }
  const phones = person.phone_numbers || [];

  const priorityTypes = ['direct_phone', 'mobile_phone', 'other'];
  for (const type of priorityTypes) {
    const match = phones.find((p) => p.type === type && p.raw_number);
    if (match) return match.raw_number;
  }

  // Fallback: any number available
  if (phones.length > 0 && phones[0].raw_number) return phones[0].raw_number;

  // Last resort: top-level field (older API responses)
  return person.phone || person.sanitized_phone || null;
}

/**
 * Searches Apollo for HVAC contacts in Southwest Michigan.
 * Returns an array of normalized lead objects, sorted by title priority.
 *
 * @param {number} page - Apollo pagination page (1-indexed)
 * @param {number} perPage - results per page (max 25 on free plans)
 */
async function searchHvacLeads(page = 1, perPage = 25) {
  logger.info('Searching Apollo.io', { page, perPage });

  const payload = {
    page,
    per_page: perPage,

    // Location filters
    person_locations: ['Michigan, United States'],

    // Company employee count: 1–25 (owner-operated)
    organization_num_employees_ranges: ['1,25'],

    // Industry keywords
    q_organization_keyword_tags: config.targetIndustries,

    // Target job titles (Apollo uses fuzzy matching on person_titles)
    person_titles: config.targetTitles,

    // Only return contacts with a phone number
    contact_email_status_cd: [], // don't filter by email
    // Apollo doesn't support a direct "has phone" filter via REST —
    // we filter client-side after fetching (see filterLeads below)

    // Sort by most recently added to get fresh data each run
    sort_by_field: 'contact_created_at',
    sort_ascending: false,
  };

  const response = await client.post('/mixed_people/search', payload);
  const people = response.data?.people || [];

  logger.info(`Apollo returned ${people.length} raw result(s)`);
  return people;
}

/**
 * Filters and normalizes raw Apollo people into lead objects.
 * Excludes contacts with no phone number.
 * Biases toward Southwest Michigan cities via post-filter scoring.
 */
function filterAndNormalizeLeads(people) {
  const targetCitiesLower = config.targetCities.map((c) => c.toLowerCase());

  const leads = people
    .map((person) => {
      const phone = extractPhone(person);
      if (!phone) return null; // skip contacts with no phone

      const org = person.organization || {};
      const city = person.city || org.city || '';
      const website = org.website_url || person.website_url || '';

      return {
        businessName: org.name || person.company || '',
        firstName: person.first_name || '',
        lastName: person.last_name || '',
        phone,
        city,
        website: website.replace(/^https?:\/\//, '').replace(/\/$/, ''), // clean URL
        titleScore: titleScore(person.title),
        // Flag if city is in our priority list (for sorting)
        isTargetCity: targetCitiesLower.some(
          (tc) => city.toLowerCase().includes(tc) || tc.includes(city.toLowerCase())
        ),
        rawTitle: person.title || '',
      };
    })
    .filter(Boolean) // remove nulls
    .filter((lead) => lead.businessName); // must have a company name

  // Sort: target cities first, then by title priority
  leads.sort((a, b) => {
    if (a.isTargetCity !== b.isTargetCity) return a.isTargetCity ? -1 : 1;
    return a.titleScore - b.titleScore;
  });

  logger.info(`${leads.length} lead(s) passed filters (has phone + has business name)`);
  return leads;
}

/**
 * Fetches up to `maxLeads` qualified leads from Apollo, handling pagination.
 */
async function fetchLeads(maxLeads = 25) {
  const allLeads = [];
  let page = 1;
  const perPage = 25; // Apollo free plan max per request

  while (allLeads.length < maxLeads) {
    const rawPeople = await searchHvacLeads(page, perPage);
    if (rawPeople.length === 0) break; // no more results

    const filtered = filterAndNormalizeLeads(rawPeople);
    allLeads.push(...filtered);

    // Stop if Apollo gave us a partial page (last page of results)
    if (rawPeople.length < perPage) break;
    page++;
  }

  return allLeads.slice(0, maxLeads);
}

module.exports = { fetchLeads };
