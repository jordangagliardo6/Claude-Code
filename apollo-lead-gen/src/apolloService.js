// ─────────────────────────────────────────────────────────────────────────────
// apolloService.js — Apollo.io API integration
//
// PLAN REQUIREMENT: People Search + phone reveal requires Apollo Professional
// or higher. Free plan will receive a 403 API_INACCESSIBLE error. Upgrade at:
// https://www.apollo.io/pricing
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

const apollo = axios.create({
  baseURL: APOLLO_BASE,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': process.env.APOLLO_API_KEY,
  },
  timeout: 30_000,
});

// ── Step 1: Search for owner-level contacts at small HVAC companies ─────────
async function searchHVACContacts(page = 1) {
  const payload = {
    api_key: process.env.APOLLO_API_KEY,
    person_titles: config.TARGET_TITLES,
    include_similar_titles: config.INCLUDE_SIMILAR_TITLES,
    person_locations: config.TARGET_LOCATIONS,
    organization_locations: [config.ORGANIZATION_STATE],
    q_organization_keyword_tags: config.INDUSTRY_KEYWORDS,
    organization_num_employees_ranges: config.EMPLOYEE_RANGES,
    per_page: config.MAX_LEADS_PER_RUN,
    page,
  };

  const { data } = await apollo.post('/mixed_people/api_search', payload);

  if (!data || !data.people) {
    throw new Error(`Apollo People Search returned unexpected shape: ${JSON.stringify(data)}`);
  }

  return data.people; // array of person objects (no phones yet)
}

// ── Step 2: Enrich a batch (≤10) of people to reveal phone numbers ───────────
// Apollo's bulk match endpoint accepts up to 10 people per call.
// reveal_phone_number=true is synchronous via REST (unlike the MCP wrapper).
async function enrichBatch(people) {
  const details = people.map((p) => ({
    first_name: p.first_name,
    last_name: p.last_name,
    organization_name: p.organization_name,
    domain: p.organization?.primary_domain || undefined,
    id: p.id, // Apollo person ID speeds up matching
  }));

  const payload = {
    api_key: process.env.APOLLO_API_KEY,
    reveal_phone_number: true,
    details,
  };

  const { data } = await apollo.post('/people/bulk_match', payload);

  if (!data || !data.matches) {
    throw new Error(`Apollo Bulk Match returned unexpected shape: ${JSON.stringify(data)}`);
  }

  return data.matches; // enriched person objects with phone_numbers[]
}

// ── Step 3: Verify the API key works (called during --test mode) ─────────────
async function testConnection() {
  const { data } = await apollo.get('/users/api_profile', {
    params: { api_key: process.env.APOLLO_API_KEY },
  });
  if (!data || !data.user) throw new Error('Apollo API returned no user profile');
  return { email: data.user.email, plan: data.user.organization?.plan_type };
}

// ── Main export: fetch up to MAX_LEADS_PER_RUN qualified leads with phones ──
async function fetchLeads() {
  const raw = await searchHVACContacts(1);

  if (!raw.length) {
    return [];
  }

  const leads = [];

  // Enrich in batches of 10 (Apollo bulk match limit)
  for (let i = 0; i < raw.length; i += 10) {
    const batch = raw.slice(i, i + 10);
    const enriched = await enrichBatch(batch);

    for (const person of enriched) {
      // Skip contacts with no phone number
      const phone = getBestPhone(person);
      if (!phone) continue;

      leads.push({
        dateAdded: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
        businessName: person.organization_name || '',
        firstName: person.first_name || '',
        lastName: person.last_name || '',
        phone,
        city: extractCity(person),
        website: person.organization?.website_url || person.organization?.primary_domain || '',
      });
    }

    if (leads.length >= config.MAX_LEADS_PER_RUN) break;
  }

  return leads.slice(0, config.MAX_LEADS_PER_RUN);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Prefer mobile → direct dial → work phone
function getBestPhone(person) {
  const numbers = person.phone_numbers || [];
  const priority = ['mobile', 'direct_phone', 'work_hq'];

  for (const type of priority) {
    const match = numbers.find((n) => n.type === type && n.sanitized_number);
    if (match) return formatPhone(match.sanitized_number);
  }
  // Fall back to any phone
  const any = numbers.find((n) => n.sanitized_number);
  return any ? formatPhone(any.sanitized_number) : null;
}

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw; // return as-is if unusual format
}

function extractCity(person) {
  // Apollo returns city in city, state, or present_raw_address
  if (person.city) return person.city;
  const addr = person.present_raw_address || '';
  // "Kalamazoo, MI 49001, United States" → "Kalamazoo"
  const parts = addr.split(',');
  return parts[0]?.trim() || '';
}

module.exports = { fetchLeads, testConnection };
