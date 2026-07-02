'use strict';
const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/api/v1';

// ─── Search targets ───────────────────────────────────────────────────────────

// SW Michigan cities. Apollo accepts "City, State, Country" strings.
// To expand coverage, add more cities or switch to 'Michigan, United States'.
const TARGET_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Titles in descending priority. Set include_similar_titles: false for strict matching.
const TARGET_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'general manager',
];

// 1–25 employees = owner-operated shops
const EMPLOYEE_RANGES = ['1,25'];

// SIC 1711 = Plumbing, Heating, Air-Conditioning & Mechanical Contracting
const SIC_CODES = ['1711'];

// Keyword tags as a secondary signal (catches co. bios & tag clouds)
const KEYWORD_TAGS = [
  'hvac',
  'heating',
  'air conditioning',
  'plumbing',
  'mechanical contracting',
];

// ─── Apollo REST helpers ──────────────────────────────────────────────────────

function apolloClient() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  return { key };
}

/**
 * Searches the Apollo people database with HVAC + SW Michigan filters.
 * Returns an array of raw person objects (no phone numbers yet).
 */
async function searchHVACPeople(page = 1, perPage = 50) {
  const { key } = apolloClient();

  const body = {
    api_key: key,
    // Job title filters (strict — no "similar titles" expansion)
    person_titles: TARGET_TITLES,
    include_similar_titles: false,
    // Company location, size, and industry
    organization_locations: TARGET_LOCATIONS,
    organization_num_employees_ranges: EMPLOYEE_RANGES,
    organization_sic_codes: SIC_CODES,
    q_organization_keyword_tags: KEYWORD_TAGS,
    // Pagination
    per_page: perPage,
    page,
  };

  const { data } = await axios.post(`${BASE_URL}/mixed_people/search`, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });

  return {
    people: data.people || [],
    totalEntries: data.pagination?.total_entries || 0,
  };
}

/**
 * Enriches up to N people in batches of 10 (Apollo's max per request).
 * Passing the Apollo person ID is the fastest path — no credits wasted on misses.
 * Returns the `matches` array from each batch, flattened.
 *
 * Credit cost: 1 credit per matched person. Unmatched = 0 credits.
 */
async function enrichPeopleByIds(apolloIds) {
  const { key } = apolloClient();
  const BATCH = 10;
  const results = [];

  for (let i = 0; i < apolloIds.length; i += BATCH) {
    const batch = apolloIds.slice(i, i + BATCH);
    const details = batch.map(id => ({ id }));

    const { data } = await axios.post(`${BASE_URL}/people/bulk_match`, {
      api_key: key,
      details,
      reveal_personal_emails: false,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    });

    if (Array.isArray(data.matches)) {
      results.push(...data.matches);
    }

    // Small pause between batches to stay well inside rate limits
    if (i + BATCH < apolloIds.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

/**
 * Extracts the best available phone number from a person record.
 * Priority: direct → mobile → home → any available.
 */
function extractBestPhone(person) {
  const phones = person.phone_numbers || [];
  const typePriority = ['direct_phone', 'mobile_phone', 'home_phone'];

  for (const type of typePriority) {
    const match = phones.find(p => p.type === type && (p.sanitized_number || p.raw_number));
    if (match) return match.sanitized_number || match.raw_number;
  }

  // Fall back to first available number regardless of type
  const any = phones.find(p => p.sanitized_number || p.raw_number);
  return any ? (any.sanitized_number || any.raw_number) : null;
}

/**
 * Main exported function.
 * Searches Apollo, enriches for phone numbers, and returns cleaned lead objects.
 * Only contacts with a phone number are returned.
 */
async function searchAndEnrichLeads() {
  // Fetch more candidates than we need (phones won't be available for all)
  const { people, totalEntries } = await searchHVACPeople(1, 50);
  console.log(`[apollo] Search returned ${people.length} people (${totalEntries} total in database)`);

  if (people.length === 0) return [];

  const ids = people.map(p => p.id).filter(Boolean);
  console.log(`[apollo] Enriching ${ids.length} people for phone numbers...`);

  const enriched = await enrichPeopleByIds(ids);
  console.log(`[apollo] Enrichment matched ${enriched.length} people`);

  const leads = [];
  for (const person of enriched) {
    const phone = extractBestPhone(person);
    if (!phone) continue; // user said: exclude contacts with no phone

    const org = person.organization || {};
    leads.push({
      businessName: org.name || person.organization_name || '',
      firstName:    person.first_name || '',
      lastName:     person.last_name  || '',
      phone,
      city:    person.city || org.city || '',
      website: org.website_url || '',
    });
  }

  console.log(`[apollo] ${leads.length} leads have a phone number`);
  return leads;
}

module.exports = { searchAndEnrichLeads };
