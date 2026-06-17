// Talks to Apollo.io's REST API.
//
// IMPORTANT: Apollo's People Search endpoint does NOT return phone numbers (and may
// mask some name fields depending on your plan). Getting a phone number requires a
// second call per person to the People Match (enrichment) endpoint, and phone
// enrichment specifically is asynchronous - Apollo returns a request_id and you poll
// a status endpoint a few seconds later for the result. That two-step flow is what
// this file implements. Verify endpoint paths against https://docs.apollo.io if Apollo
// changes their API.
const axios = require('axios');
const config = require('../config');

const BASE_URL = 'https://api.apollo.io/api/v1';
const PHONE_ENRICHMENT_WAIT_MS = 10000;

function apolloHeaders() {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set in the environment.');
  }
  return { 'Content-Type': 'application/json', 'x-api-key': process.env.APOLLO_API_KEY };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Step 1: find candidate people matching our filters (industry, location, company size, title).
async function searchCandidates() {
  const locations = [...config.cities, config.state];

  const { data } = await axios.post(
    `${BASE_URL}/mixed_people/search`,
    {
      person_titles: config.titlesByPriority,
      organization_locations: locations,
      organization_num_employees_ranges: [config.employeeRange],
      q_organization_keyword_tags: config.industries,
      per_page: config.searchCandidatePoolSize,
      page: 1,
    },
    { headers: apolloHeaders() }
  );

  return data.people || [];
}

// Lower rank = higher priority. Unmatched titles sort last.
function titleRank(title) {
  if (!title) return config.titlesByPriority.length;
  const lower = title.toLowerCase();
  const idx = config.titlesByPriority.findIndex((t) => lower.includes(t.toLowerCase()));
  return idx === -1 ? config.titlesByPriority.length : idx;
}

function extractPhone(person) {
  if (!person) return null;
  if (person.mobile_phone) return person.mobile_phone;
  if (Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0) {
    const preferred = person.phone_numbers.find((p) => /mobile|direct/i.test(p.type || ''));
    const chosen = preferred || person.phone_numbers[0];
    return chosen.sanitized_number || chosen.raw_number || null;
  }
  return null;
}

// Step 2: enrich a single candidate to reveal their phone number.
// Returns the phone number string, or null if none could be found.
async function enrichPhone(person) {
  const { data } = await axios.post(
    `${BASE_URL}/people/match`,
    {
      id: person.id,
      first_name: person.first_name,
      last_name: person.last_name,
      organization_name: person.organization && person.organization.name,
      reveal_phone_number: true,
    },
    { headers: apolloHeaders() }
  );

  const requestId = data && data.phone_enrichment && data.phone_enrichment.request_id;
  const immediatePhone = extractPhone(data && data.person);
  if (immediatePhone) return immediatePhone;
  if (!requestId) return null;

  // Phone lookup is async - give Apollo a few seconds, then poll for the result once.
  await sleep(PHONE_ENRICHMENT_WAIT_MS);
  try {
    const statusResp = await axios.get(`${BASE_URL}/people/match/phone_status`, {
      params: { request_id: requestId },
      headers: apolloHeaders(),
    });
    return extractPhone(statusResp.data && statusResp.data.person);
  } catch (err) {
    // If the status endpoint isn't ready/available, treat this lead as "no phone yet"
    // rather than failing the whole run.
    return null;
  }
}

// Full pipeline: search -> sort by title priority -> enrich -> drop anyone without a phone.
// Stops early once we have enough leads for this run.
async function findHvacLeads() {
  const candidates = await searchCandidates();
  candidates.sort((a, b) => titleRank(a.title) - titleRank(b.title));

  const leads = [];
  for (const person of candidates) {
    if (leads.length >= config.maxNewLeadsPerRun) break;

    const phone = await enrichPhone(person);
    if (!phone) continue; // exclude contacts with no phone number, per requirements

    leads.push({
      businessName: (person.organization && person.organization.name) || '',
      ownerFirstName: person.first_name || '',
      ownerLastName: person.last_name || '',
      phone,
      city: person.city || (person.organization && person.organization.city) || '',
      website: (person.organization && person.organization.website_url) || '',
    });
  }

  return leads;
}

module.exports = { findHvacLeads };
