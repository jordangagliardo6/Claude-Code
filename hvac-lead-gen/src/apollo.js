const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

const BASE = 'https://api.apollo.io/api/v1';

// NOTE: Apollo's people search endpoint returns phone_numbers only for contacts
// already enriched in its database. Contacts without populated phone_numbers are
// filtered out below. If you consistently see zero phones, enable enrichment by
// setting APOLLO_ENRICH_PHONES=true — but note that costs 1 credit per contact.

function buildSearchPayload(page) {
  return {
    api_key: process.env.APOLLO_API_KEY,
    // Cast a wide keyword net across HVAC + related trades
    q_keywords: 'HVAC heating air conditioning plumbing mechanical contractor',
    person_titles: config.TARGET_TITLES,
    include_similar_titles: true,
    // Person must be located in one of our target cities
    person_locations: config.TARGET_CITIES,
    // Company must be headquartered in Michigan
    organization_locations: ['Michigan, United States'],
    organization_num_employees_ranges: [config.EMPLOYEE_RANGE],
    q_organization_keyword_tags: config.INDUSTRY_KEYWORDS,
    // Fetch more than MAX_LEADS_PER_RUN so we have extras after duplicate-filtering
    per_page: 50,
    page,
  };
}

// Prefer mobile/direct numbers; fall back to first available
function pickBestPhone(phoneNumbers) {
  if (!phoneNumbers?.length) return null;
  const ranked = ['mobile', 'cell', 'direct', 'work', 'other'];
  for (const type of ranked) {
    const match = phoneNumbers.find(p => p.type === type);
    if (match) return match.sanitized_number || match.raw_number;
  }
  return phoneNumbers[0].sanitized_number || phoneNumbers[0].raw_number;
}

// Map Apollo person object → our internal lead shape
function personToLead(person) {
  const org = person.organization || {};
  const domain = org.primary_domain;
  return {
    businessName: org.name || (person.employment_history?.[0]?.organization_name) || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: pickBestPhone(person.phone_numbers),
    city: person.city || org.city || '',
    website: org.website_url || (domain ? `https://${domain}` : ''),
    titleRaw: (person.title || '').toLowerCase(),
    apolloId: person.id,
  };
}

// Returns priority score for a lead based on its job title (lower = higher priority)
function titlePriority(titleRaw) {
  for (const [key, score] of Object.entries(config.TITLE_PRIORITY)) {
    if (titleRaw.includes(key)) return score;
  }
  return 99;
}

async function searchLeads(page = 1) {
  const payload = buildSearchPayload(page);
  logger.info(`Apollo search — page ${page}, cities: ${config.TARGET_CITIES.length} targets`);

  const response = await axios.post(`${BASE}/mixed_people/search`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });

  const { people = [], pagination = {} } = response.data;
  logger.info(`Apollo returned ${people.length} people (page ${page}/${pagination.total_pages ?? '?'})`);

  // Keep only contacts with at least one phone number
  const withPhone = people.filter(p => p.phone_numbers?.length > 0);
  logger.info(`${withPhone.length}/${people.length} contacts have phone numbers`);

  const leads = withPhone
    .map(personToLead)
    .filter(l => l.businessName && l.phone); // must have both

  return {
    leads,
    hasMore: page < (pagination.total_pages ?? 1),
    totalPages: pagination.total_pages ?? 1,
  };
}

// Fetch multiple pages and return leads sorted by title priority
async function fetchLeads(maxCandidates = 100) {
  const all = [];
  let page = 1;
  const MAX_PAGES = 5; // safety cap to avoid runaway credit use

  while (all.length < maxCandidates && page <= MAX_PAGES) {
    const { leads, hasMore } = await searchLeads(page);
    all.push(...leads);
    if (!hasMore || leads.length === 0) break;
    page++;
  }

  // Sort by title priority so Owners surface before General Managers
  all.sort((a, b) => titlePriority(a.titleRaw) - titlePriority(b.titleRaw));
  return all;
}

// Confirm the API key is valid with a minimal probe request
async function verifyConnection() {
  try {
    await axios.post(
      `${BASE}/mixed_people/search`,
      { api_key: process.env.APOLLO_API_KEY, per_page: 1, page: 1 },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 }
    );
    return true;
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      throw new Error('Apollo API key rejected (401/403) — check APOLLO_API_KEY');
    }
    throw err;
  }
}

module.exports = { fetchLeads, verifyConnection };
