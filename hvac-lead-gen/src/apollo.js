// Apollo.io REST API client for HVAC lead prospecting
const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// ── Configurable target cities — edit this list to adjust coverage ──
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// ── Target decision-maker titles in priority order ──
const TARGET_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'general manager',
];

// ── Industry keyword tags matching HVAC/Plumbing/Mechanical ──
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating',
  'cooling',
  'air conditioning',
  'mechanical contractor',
];

function getApiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY environment variable is not set');
  return key;
}

// Search Apollo for people matching our filters
async function searchPeople(maxResults) {
  logger.info('Querying Apollo people search', { cities: SW_MICHIGAN_CITIES, maxResults });

  const { data } = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    {
      api_key: getApiKey(),
      person_titles: TARGET_TITLES,
      person_seniorities: ['owner', 'c_suite', 'founder'],
      organization_num_employees_ranges: ['1,25'],
      q_organization_keyword_tags: INDUSTRY_KEYWORDS,
      // Broad Michigan location — Apollo will match city-level from its database
      organization_locations: ['Michigan, United States'],
      person_locations: SW_MICHIGAN_CITIES,
      per_page: Math.min(maxResults, 100),
      page: 1,
    },
    {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      timeout: 30_000,
    }
  );

  const people = data?.people ?? [];
  const total = data?.pagination?.total_entries ?? '?';
  logger.info(`Apollo returned ${people.length} people (${total} total matches)`);
  return people;
}

// Enrich a single person by Apollo ID to reveal their phone number
async function enrichPerson(apolloId) {
  const { data } = await axios.post(
    `${APOLLO_BASE}/people/match`,
    { api_key: getApiKey(), id: apolloId, reveal_phone_number: true },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
  );
  return data?.person ?? null;
}

// Extract the best available phone number from a person record
function extractPhone(person) {
  const phones = person.phone_numbers ?? [];

  // Prefer direct/mobile over work numbers
  const preferred = phones.find(p =>
    p.type === 'direct_phone' || p.type === 'mobile_phone'
  );
  if (preferred) return preferred.sanitized_number || preferred.raw_number || null;

  // Fall back to first available
  if (phones.length > 0) return phones[0].sanitized_number || phones[0].raw_number || null;

  // Top-level phone fields (some plans surface these directly)
  return person.sanitized_phone || person.phone || null;
}

// Best-effort city extraction when person.city is blank
function extractCity(person) {
  const loc = (person.location || person.city || '').toLowerCase();
  const cityMap = {
    'st. joseph': 'St. Joseph',   'saint joseph': 'St. Joseph',
    'benton harbor': 'Benton Harbor',
    'kalamazoo': 'Kalamazoo',
    'holland': 'Holland',
    'grand haven': 'Grand Haven',
    'muskegon': 'Muskegon',
    'south haven': 'South Haven',
  };
  for (const [key, label] of Object.entries(cityMap)) {
    if (loc.includes(key)) return label;
  }
  return person.city || '';
}

// Main export: fetch, enrich, and clean leads
async function fetchLeads(maxResults = 25) {
  const people = await searchPeople(maxResults);
  const leads = [];

  for (const person of people) {
    let phone = extractPhone(person);

    // Attempt enrichment if no phone visible (costs Apollo credits — see docs)
    if (!phone && person.id) {
      try {
        logger.info(`Enriching ${person.id} to get phone number`);
        // Small delay to respect Apollo rate limits
        await new Promise(r => setTimeout(r, 500));
        const enriched = await enrichPerson(person.id);
        if (enriched) phone = extractPhone(enriched);
      } catch (err) {
        logger.warn(`Enrichment failed for ${person.id}: ${err.message}`);
      }
    }

    if (!phone) {
      logger.info(`Skipping — no phone: ${person.first_name} ${person.last_name} @ ${person.organization_name}`);
      continue;
    }

    leads.push({
      businessName: person.organization_name || '',
      firstName:    person.first_name || '',
      lastName:     person.last_name  || '',
      phone,
      city:    extractCity(person),
      website: person.organization?.website_url || person.website_url || '',
    });
  }

  logger.info(`Collected ${leads.length} leads with phone numbers out of ${people.length} returned`);
  return leads;
}

module.exports = { fetchLeads, SW_MICHIGAN_CITIES, TARGET_TITLES, INDUSTRY_KEYWORDS };
