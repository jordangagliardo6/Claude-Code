const axios = require('axios');
const { apollo, TARGET_LOCATIONS, TARGET_INDUSTRIES, TARGET_TITLES } = require('./config');

// Flat list of all city names for Apollo location search
const CITY_LIST = TARGET_LOCATIONS.map(l => l.city);

/**
 * Score a contact's title so we can pick the most senior person at each company.
 * Lower number = higher priority.
 */
function titlePriority(title = '') {
  const t = title.toLowerCase();
  const order = ['owner', 'president', 'founder', 'co-founder', 'co founder', 'general manager'];
  const idx = order.findIndex(o => t.includes(o));
  return idx === -1 ? 999 : idx;
}

/**
 * Pick the best phone number from a contact's phone array.
 * Prefers mobile > direct > work.
 */
function bestPhone(phoneNumbers = []) {
  if (!phoneNumbers || phoneNumbers.length === 0) return null;
  const order = ['mobile', 'direct', 'work', 'other'];
  for (const type of order) {
    const match = phoneNumbers.find(p => p.type?.toLowerCase() === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  // Fall back to any number present
  const first = phoneNumbers.find(p => p.sanitized_number);
  return first ? first.sanitized_number : null;
}

/**
 * Search Apollo for HVAC contacts matching our target criteria.
 * Returns an array of normalized lead objects.
 *
 * Apollo mixed people search docs:
 * https://apolloio.github.io/apollo-api-docs/?shell#mixed-people-search
 */
async function searchLeads(maxResults = 25) {
  if (!apollo.apiKey) throw new Error('APOLLO_API_KEY is not set in .env');

  const leads = [];
  let page = 1;
  const perPage = Math.min(maxResults, 25); // Apollo max per page is 25

  while (leads.length < maxResults) {
    const remaining = maxResults - leads.length;
    const pageSize = Math.min(perPage, remaining);

    const payload = {
      api_key: apollo.apiKey,
      page,
      per_page: pageSize,

      // Location — state-level to cast a wide net, then we filter by city
      person_locations: ['Michigan, United States'],

      // Industries
      organization_industry_tag_ids: [], // We use keyword search instead
      q_organization_keyword_tags: TARGET_INDUSTRIES,

      // Company employee count: 1–25
      organization_num_employees_ranges: ['1,25'],

      // Job titles
      person_titles: TARGET_TITLES,

      // Must have a phone number
      contact_email_status_v2: [], // not filtering by email
      // Apollo doesn't have a strict "has phone" filter but we filter post-fetch
    };

    let response;
    try {
      response = await axios.post(
        `${apollo.baseUrl}/mixed_people/search`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
          timeout: 30000,
        }
      );
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      throw new Error(`Apollo API request failed (page ${page}): ${msg}`);
    }

    const people = response.data?.people || [];
    if (people.length === 0) break; // No more results

    for (const person of people) {
      // Filter: must be in one of our target cities (case-insensitive)
      const personCity = (person.city || person.organization?.city || '').trim();
      const cityMatch = CITY_LIST.some(
        c => c.toLowerCase() === personCity.toLowerCase()
      );
      if (!cityMatch) continue;

      // Filter: must have a usable phone number
      const phone = bestPhone(person.phone_numbers);
      if (!phone) continue;

      leads.push({
        businessName: person.organization?.name || '',
        firstName: person.first_name || '',
        lastName: person.last_name || '',
        title: person.title || '',
        titleScore: titlePriority(person.title),
        phone,
        city: personCity,
        website: person.organization?.website_url || '',
      });
    }

    // Apollo returns pagination metadata
    const totalPages = response.data?.pagination?.total_pages || 1;
    if (page >= totalPages) break;
    page++;

    // Brief pause to respect Apollo rate limits (5 req/sec on paid plans)
    await new Promise(r => setTimeout(r, 300));
  }

  // Deduplicate by business name (keep highest-priority title per company)
  const byBusiness = new Map();
  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (!key) continue;
    const existing = byBusiness.get(key);
    if (!existing || lead.titleScore < existing.titleScore) {
      byBusiness.set(key, lead);
    }
  }

  return Array.from(byBusiness.values()).slice(0, maxResults);
}

module.exports = { searchLeads };
