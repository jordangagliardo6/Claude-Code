const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

const client = axios.create({
  baseURL: config.apollo.baseUrl,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

// ── Payload builder ────────────────────────────────────────────────────────────

function buildSearchPayload(page = 1) {
  return {
    api_key: config.apollo.apiKey,

    // Decision-maker titles in priority order
    person_titles: config.targetTitles,

    // Southwest Michigan city+state strings — add more cities in config.js
    q_organization_locations: config.targetCities,

    // HVAC / Plumbing / Mechanical industry keywords
    q_organization_keyword_tags: config.targetIndustries,

    // 1–25 employees only (owner-operated shops)
    q_organization_num_employees_ranges: ['1,25'],

    // Bias results toward Michigan
    person_locations: ['Michigan, United States'],

    // Only return people who have at least one phone number on file
    has_phone: true,

    page,
    per_page: config.apollo.maxLeadsPerRun,
  };
}

// ── Response parsing ───────────────────────────────────────────────────────────

// Phone type preference: mobile > direct > work > anything
const PHONE_PRIORITY = ['mobile', 'direct', 'work', 'other'];

function extractPhone(phoneNumbers = []) {
  if (!phoneNumbers || phoneNumbers.length === 0) return null;

  for (const type of PHONE_PRIORITY) {
    const match = phoneNumbers.find(
      p => (p.type || '').toLowerCase() === type && (p.sanitized_number || p.raw_number)
    );
    if (match) return match.sanitized_number || match.raw_number;
  }

  // Fallback: any number available
  const fallback = phoneNumbers.find(p => p.sanitized_number || p.raw_number);
  return fallback ? (fallback.sanitized_number || fallback.raw_number) : null;
}

// Lower number = higher priority (Owner=0, GM=4)
function titlePriority(title = '') {
  const t = title.toLowerCase();
  const order = ['owner', 'president', 'founder', 'co-founder', 'co founder', 'general manager'];
  const idx = order.findIndex(o => t.includes(o));
  return idx === -1 ? 999 : idx;
}

function parseLead(person) {
  const phone = extractPhone(person.phone_numbers);
  if (!phone) return null; // Apollo filter should catch this, but double-check

  const org = person.organization || {};

  // Prefer person-level city, fall back to org city, then state
  const city = (person.city || org.city || person.state || org.state || 'Michigan').trim();

  return {
    businessName: (org.name || '').trim(),
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone,
    city,
    website: (org.website_url || '').replace(/\/$/, '').trim(),
    title: (person.title || '').trim(), // kept for sorting, not written to sheet
  };
}

// ── Main search ────────────────────────────────────────────────────────────────

async function searchLeads() {
  logger.info('[Apollo] Searching for HVAC decision-makers in Southwest Michigan...');

  const payload = buildSearchPayload(1);

  let data;
  try {
    const response = await client.post('/mixed_people/search', payload);
    data = response.data;
  } catch (err) {
    const status = err.response?.status;
    const body = JSON.stringify(err.response?.data || {});
    logger.error(`[Apollo] API error (HTTP ${status}): ${body}`, err);
    throw err;
  }

  const people = data?.people || [];

  if (people.length === 0) {
    logger.warn('[Apollo] Search returned 0 results');
    return [];
  }

  const total = data?.pagination?.total_entries ?? '?';
  logger.info(`[Apollo] Received ${people.length} raw results (Apollo reports ~${total} total matches)`);

  // Parse → filter out missing phone/name → sort by title priority
  const leads = people
    .map(parseLead)
    .filter(Boolean)
    .filter(l => l.businessName)
    .sort((a, b) => titlePriority(a.title) - titlePriority(b.title))
    .slice(0, config.apollo.maxLeadsPerRun);

  logger.success(`[Apollo] ${leads.length} qualified leads after filtering`);
  return leads;
}

// ── Connection test ────────────────────────────────────────────────────────────

async function verify() {
  logger.info('[Apollo] Verifying API key...');
  try {
    const res = await client.post('/mixed_people/search', {
      api_key: config.apollo.apiKey,
      per_page: 1,
      page: 1,
      person_titles: ['Owner'],
      q_organization_locations: ['Michigan, United States'],
    });

    if (res.status === 200) {
      logger.success('[Apollo] API key is valid — connection OK');
      return true;
    }
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.message;
    logger.error(`[Apollo] Verification failed (HTTP ${status}): ${msg}`, err);
  }
  return false;
}

module.exports = { searchLeads, verify };
