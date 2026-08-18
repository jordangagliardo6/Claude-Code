// ─── Apollo.io API Integration ────────────────────────────────────────────────
// Handles people search and enrichment (phone number reveal).
// Requires APOLLO_API_KEY in your .env. Basic plan or higher needed for search.

const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/v1';

// Shared axios instance with timeout and base URL
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

// ─── People Search ────────────────────────────────────────────────────────────
// Searches Apollo's global database for decision-makers at HVAC companies
// in SW Michigan. Returns raw Apollo people objects (no phone numbers yet).
async function searchPeople(config, page = 1) {
  const { cities, jobTitles, seniorities, industryKeywords, employeeRange } = config;

  const body = {
    api_key: process.env.APOLLO_API_KEY,
    per_page: 100, // fetch max per page so we have headroom after dedup
    page,

    // Title filter: Owner, President, Founder, Co-Founder, General Manager
    person_titles: jobTitles,

    // Seniority complements title for better coverage
    person_seniorities: seniorities,

    // Person's own location (city-level)
    person_locations: cities,

    // Company HQ in Michigan (catches corps registered elsewhere but HQ'd locally)
    organization_locations: ['Michigan, United States'],

    // Industry tags on the company record
    q_organization_keyword_tags: industryKeywords,

    // Company size 1–25 employees
    organization_num_employees_ranges: [employeeRange],
  };

  const { data } = await api.post('/mixed_people/search', body);

  if (data.error) {
    throw new Error(`Apollo search error: ${data.error}`);
  }

  return data.people || [];
}

// ─── Enrichment (phone reveal) ────────────────────────────────────────────────
// Takes an array of Apollo person IDs and returns enriched records with
// phone numbers. Each enrichment call costs 1 credit per person revealed.
// We only call this AFTER deduplication so we don't waste credits.
async function enrichPeople(personIds) {
  if (!personIds.length) return [];

  // Apollo's bulk_match accepts up to 10 IDs at once
  const BATCH_SIZE = 10;
  const results = [];

  for (let i = 0; i < personIds.length; i += BATCH_SIZE) {
    const batch = personIds.slice(i, i + BATCH_SIZE);

    const { data } = await api.post('/people/bulk_match', {
      api_key: process.env.APOLLO_API_KEY,
      details: batch.map(id => ({ id })),
      reveal_personal_emails: false,
      reveal_phone_number: true, // this is what costs credits
    });

    if (data.matches) {
      results.push(...data.matches);
    }

    // Respect Apollo's rate limit between batches
    if (i + BATCH_SIZE < personIds.length) {
      await sleep(500);
    }
  }

  return results;
}

// ─── Phone extraction ─────────────────────────────────────────────────────────
// Pulls the best available phone number from an enriched person record.
// Priority: mobile → direct → any other type.
function extractBestPhone(person) {
  if (!person) return null;

  // Top-level sanitized_phone is the primary direct/mobile
  if (person.sanitized_phone) return person.sanitized_phone;

  const phones = person.phone_numbers || [];
  if (!phones.length) return null;

  const mobile = phones.find(p => p.type === 'mobile');
  const direct = phones.find(p => p.type === 'direct');
  const fallback = phones[0];

  return (mobile || direct || fallback)?.sanitized_number || null;
}

// ─── Lead formatting ──────────────────────────────────────────────────────────
// Merges a search-result person with their enriched record into a clean lead.
function formatLead(searchPerson, enrichedPerson) {
  const org = searchPerson.organization || {};

  const phone = extractBestPhone(enrichedPerson) || extractBestPhone(searchPerson);

  // Clean city: strip ", Michigan" / ", MI" suffix Apollo often appends
  const rawCity =
    enrichedPerson?.city ||
    searchPerson.city ||
    org.city ||
    '';
  const city = rawCity.replace(/,\s*(Michigan|MI)\s*$/i, '').trim();

  return {
    businessName: org.name || '',
    firstName: searchPerson.first_name || '',
    lastName: searchPerson.last_name || '',
    phone: phone || '',
    city,
    website: org.website_url || org.primary_domain || '',
  };
}

// ─── Connectivity check ───────────────────────────────────────────────────────
// Calls a lightweight Apollo endpoint to verify the API key is valid.
async function verifyApiKey() {
  const { data } = await api.get('/auth/health', {
    params: { api_key: process.env.APOLLO_API_KEY },
  });
  return data?.is_logged_in === true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchPeople, enrichPeople, formatLead, verifyApiKey };
