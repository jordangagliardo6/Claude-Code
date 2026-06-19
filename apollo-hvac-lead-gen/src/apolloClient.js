// Thin wrapper around the Apollo.io REST API: company/people search plus
// per-lead phone enrichment.
const fetch = require('node-fetch');
const config = require('../config');

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

function apiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY is not set');
  return key;
}

async function apolloPost(path, body) {
  const res = await fetch(`${APOLLO_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey(),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Apollo API error ${res.status}: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

// Cheap read-only call used by scripts/test-connections.js to confirm the
// API key works before the first scheduled run.
async function testConnection() {
  await apolloPost('/mixed_people/search', {
    page: 1,
    per_page: 1,
    person_titles: ['Owner'],
  });
  return true;
}

// Searches Apollo for people matching the industry/size/title/location
// filters defined in config.js. Returns one page of raw Apollo person
// records (each includes a nested `organization` object).
async function searchLeads({ page = 1, perPage = 50 } = {}) {
  const body = {
    page,
    per_page: perPage,
    person_titles: config.titlePriority,
    organization_locations: [config.stateLocation],
    organization_num_employees_ranges: [config.employeeRange],
    q_organization_keyword_tags: config.industryKeywords,
  };
  const data = await apolloPost('/mixed_people/search', body);
  return data.people || [];
}

// Apollo's search results mask personal direct-dial/mobile numbers. This
// calls the match/enrichment endpoint to reveal one for a specific person.
//
// Note: depending on your Apollo plan, phone reveal can be asynchronous
// (delivered later via a webhook) rather than returned in this response. If
// `phone_numbers` comes back empty here, we fall back to the company's main
// line so the lead isn't dropped outright — see README "Known limitations".
async function enrichPhone(person) {
  const data = await apolloPost('/people/match', {
    id: person.id,
    reveal_phone_number: true,
  });
  const match = data.person || {};

  const directPhone = match.phone_numbers?.[0]?.raw_number || match.sanitized_phone || null;
  const orgPhone = match.organization?.primary_phone?.number || match.organization?.phone || null;

  return { directPhone, orgPhone };
}

module.exports = { searchLeads, enrichPhone, testConnection };
