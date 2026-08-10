/**
 * apollo.js — Apollo.io API integration
 *
 * Searches for HVAC company owners in Southwest Michigan and enriches
 * results with direct/mobile phone numbers.
 *
 * Apollo API docs: https://apolloio.github.io/apollo-api-docs/
 * Required plan: Basic ($49/mo) or higher for people search API access.
 */

'use strict';
const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// ─── SEARCH FILTERS — edit freely ────────────────────────────────────────────

// Job titles to target, in priority order (Owner is most likely to be the decision-maker)
const TARGET_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'general manager',
];

// Industry keyword tags that Apollo uses to classify companies
const INDUSTRY_TAGS = [
  'hvac',
  'heating',
  'air conditioning',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
];

// NAICS 23822 = Plumbing, Heating, and Air-Conditioning Contractors
const NAICS_CODE = '23822';

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC owners in the given cities, then enrich with phones.
 * Returns up to maxResults leads that have a phone number.
 *
 * @param {string[]} cities - Array of "City, State" strings
 * @param {number}   maxResults - Cap on leads returned
 * @returns {Promise<Array>}
 */
async function searchHVACLeads(cities, maxResults) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  // Fetch extra candidates so we still hit maxResults after filtering phone-less contacts
  const fetchSize = Math.min(maxResults * 2, 50);

  console.log(`  Sending Apollo people search (up to ${fetchSize} candidates)...`);
  const searchRes = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    {
      api_key: apiKey,
      q_keywords: 'HVAC heating air conditioning plumbing mechanical',
      person_titles: TARGET_TITLES,
      include_similar_titles: false,
      organization_locations: cities,
      organization_num_employees_ranges: ['1,25'], // owner-operated: 1–25 employees
      q_organization_keyword_tags: INDUSTRY_TAGS,
      organization_naics_codes: [NAICS_CODE],
      page: 1,
      per_page: fetchSize,
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const people = searchRes.data.people || [];
  if (people.length === 0) {
    console.log('  Apollo search returned 0 results.');
    return [];
  }
  console.log(`  Found ${people.length} raw candidates — enriching for phone numbers...`);

  // Enrich in batches of 10 (Apollo bulk match limit)
  const leads = [];
  for (let i = 0; i < people.length && leads.length < maxResults; i += 10) {
    const batch = people.slice(i, i + 10);
    const enriched = await enrichBatch(batch, apiKey);
    // Drop contacts with no phone number (as requested)
    const withPhone = enriched.filter((p) => p.phone);
    leads.push(...withPhone);
    if (withPhone.length < enriched.length) {
      console.log(
        `  Batch ${Math.floor(i / 10) + 1}: ${withPhone.length}/${enriched.length} had phone numbers.`
      );
    }
  }

  return leads.slice(0, maxResults);
}

/**
 * Enrich a batch of up to 10 Apollo people records to reveal phone numbers.
 * Uses lead credits (each successful reveal costs 1 direct dial credit).
 */
async function enrichBatch(people, apiKey) {
  const details = people.map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    organization_name: p.organization?.name,
    domain: p.organization?.primary_domain,
  }));

  const res = await axios.post(
    `${APOLLO_BASE}/people/bulk_match`,
    {
      api_key: apiKey,
      details,
      reveal_phone_number: true, // costs 1 direct dial credit per successful reveal
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const matched = res.data.matches || [];

  return matched.map((m) => {
    // Pick best phone: mobile first, then direct, then any
    const phones = m.phone_numbers || [];
    const phone =
      phones.find((p) => p.type === 'mobile') ||
      phones.find((p) => p.type === 'direct') ||
      phones[0];

    return {
      apolloId: m.id || '',
      firstName: m.first_name || '',
      lastName: m.last_name || '',
      businessName: m.organization?.name || '',
      phone: phone?.sanitized_number || phone?.raw_number || '',
      city: m.organization?.city || m.city || '',
      website:
        m.organization?.website_url ||
        (m.organization?.primary_domain
          ? `https://${m.organization.primary_domain}`
          : ''),
    };
  });
}

/**
 * Quick connection test — verifies the API key works without spending credits.
 * Returns true if the key is valid and the search API is accessible.
 */
async function testApolloConnection() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.log('  Apollo: ❌ APOLLO_API_KEY is not set in .env');
    return false;
  }
  try {
    const res = await axios.post(
      `${APOLLO_BASE}/mixed_people/search`,
      { api_key: apiKey, q_keywords: 'hvac michigan', per_page: 1 },
      { headers: { 'Content-Type': 'application/json' } }
    );
    const total = res.data.pagination?.total_entries?.toLocaleString() ?? '?';
    console.log(`  Apollo: ✅ API key valid — ${total} matching records in database.`);
    return true;
  } catch (err) {
    const errData = err.response?.data;
    if (errData?.error_code === 'API_INACCESSIBLE') {
      console.log('  Apollo: ❌ People search API not accessible on your current plan.');
      console.log('           Upgrade to Basic ($49/mo) at https://www.apollo.io/pricing');
    } else {
      console.log(`  Apollo: ❌ ${errData?.message || err.message}`);
    }
    return false;
  }
}

module.exports = { searchHVACLeads, testApolloConnection };
