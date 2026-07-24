/**
 * apollo.js — Apollo.io People Search
 *
 * Searches Apollo's database for HVAC/plumbing company owners in SW Michigan
 * and returns only contacts that have a phone number.
 *
 * To change target cities, industries, or job titles, edit the arrays at the top.
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// ── Configuration ─────────────────────────────────────────────────────────────
// Edit any of these arrays to change your targeting without touching the logic.

const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Apollo keyword tags — used to match the company's industry category
const TARGET_INDUSTRIES = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating ventilation air conditioning',
];

// Job titles to target — Apollo does a fuzzy "contains" match on these
const TARGET_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'general manager',
];

// SIC 1711 = Plumbing, Heating & Air-Conditioning contractors
// NAICS 23822 = Plumbing, Heating, and Air-Conditioning Contractors (prefix match)
const SIC_CODES = ['1711'];
const NAICS_CODES = ['23822'];

// ── API client ────────────────────────────────────────────────────────────────

function buildClient() {
  return axios.create({
    baseURL: APOLLO_BASE,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': process.env.APOLLO_API_KEY,
    },
    timeout: 30000,
  });
}

// ── People search ─────────────────────────────────────────────────────────────

async function searchPeople(page = 1, perPage = 25) {
  const client = buildClient();

  const { data } = await client.post('/mixed_people/search', {
    page,
    per_page: perPage,
    person_titles: TARGET_TITLES,
    person_seniorities: ['owner', 'c_suite'],
    organization_num_employees_ranges: ['1,25'],
    organization_locations: SW_MICHIGAN_CITIES,
    q_organization_keyword_tags: TARGET_INDUSTRIES,
    organization_sic_codes: SIC_CODES,
    organization_naics_codes: NAICS_CODES,
  });

  return data;
}

// ── Enrichment (optional, uses API credits) ───────────────────────────────────

async function enrichPeopleBatch(apolloIds) {
  if (!apolloIds || apolloIds.length === 0) return [];
  const client = buildClient();

  const { data } = await client.post('/people/bulk_match', {
    reveal_personal_emails: false,
    reveal_phone_number: true,
    details: apolloIds.map(id => ({ id })),
  });

  return data.matches || [];
}

// ── Data extraction helpers ───────────────────────────────────────────────────

function extractBestPhone(person) {
  // Priority: mobile > direct > first entry in phone_numbers array
  if (person.mobile_phone) return person.mobile_phone;
  if (person.direct_phone) return person.direct_phone;

  const phones = person.phone_numbers || [];

  const mobile = phones.find(p => p.type === 'mobile' || p.type === 'cell');
  if (mobile) return mobile.sanitized_number || mobile.raw_value;

  const direct = phones.find(p => p.type === 'direct');
  if (direct) return direct.sanitized_number || direct.raw_value;

  // Fall back to first phone of any type
  if (phones[0]) return phones[0].sanitized_number || phones[0].raw_value;

  return null;
}

function extractCity(person) {
  // Prefer the company's city over the contact's personal city
  if (person.organization?.city) return person.organization.city;
  if (person.city) return person.city;

  // Parse from a raw address string as a last resort
  const address = person.organization?.raw_address || person.present_raw_address || '';
  return address.split(',')[0]?.trim() || '';
}

function extractWebsite(person) {
  const raw =
    person.organization?.website_url ||
    person.account?.website_url ||
    person.website_url ||
    '';
  // Strip protocol and trailing slash for readability in the sheet
  return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function mapToLead(person) {
  return {
    businessName: (person.organization_name || person.organization?.name || '').trim(),
    firstName:    (person.first_name || '').trim(),
    lastName:     (person.last_name || '').trim(),
    phone:        extractBestPhone(person) || '',
    city:         extractCity(person),
    website:      extractWebsite(person),
    apolloId:     person.id,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Searches Apollo for HVAC leads and returns contacts with phone numbers.
 * @param {number} targetCount  How many candidates to gather before dedup (fetch extra)
 * @returns {Promise<Array>}    Array of lead objects ready to write to Sheets
 */
async function fetchHVACLeads(targetCount = 75) {
  const withPhone = [];
  const noPhoneIds = [];
  let page = 1;
  const perPage = 25;

  // Phase 1: search pages until we have enough candidates or run out of results
  while (withPhone.length < targetCount) {
    const data = await searchPeople(page, perPage);
    const people = data.people || [];

    if (people.length === 0) {
      console.log(`  No more results from Apollo (stopped at page ${page}).`);
      break;
    }

    for (const person of people) {
      const lead = mapToLead(person);
      if (!lead.businessName) continue;

      if (lead.phone) {
        withPhone.push(lead);
      } else if (process.env.APOLLO_ENRICH_CONTACTS === 'true' && person.id) {
        // Queue for enrichment if the user has opted in
        noPhoneIds.push(person.id);
      }
    }

    const total = data.pagination?.total_entries || 0;
    const totalPages = Math.ceil(total / perPage);
    console.log(`  Page ${page}/${totalPages}: ${people.length} contacts, ${withPhone.length} with phones so far.`);

    // Stop if we've read all pages or hit a safety cap
    if (page >= totalPages || page >= 8) break;
    page++;

    await sleep(300); // brief pause to stay within Apollo rate limits
  }

  // Phase 2: enrich contacts that had no phone in search results (optional)
  if (noPhoneIds.length > 0 && process.env.APOLLO_ENRICH_CONTACTS === 'true') {
    console.log(`  Enriching ${noPhoneIds.length} contacts that lacked phone numbers...`);

    // Bulk match accepts up to 10 IDs per request
    for (let i = 0; i < noPhoneIds.length; i += 10) {
      const batch = noPhoneIds.slice(i, i + 10);
      try {
        const enriched = await enrichPeopleBatch(batch);
        for (const person of enriched) {
          const lead = mapToLead(person);
          if (lead.phone && lead.businessName) withPhone.push(lead);
        }
        await sleep(300);
      } catch (err) {
        // Non-fatal: log and continue without enriched results
        console.warn(`  Enrichment batch ${i / 10 + 1} failed (skipping): ${err.message}`);
      }
    }
  }

  return withPhone;
}

/**
 * Verifies the Apollo API key is valid by running a minimal search.
 */
async function testConnection() {
  const client = buildClient();
  const { data } = await client.post('/mixed_people/search', {
    page: 1,
    per_page: 1,
    q_keywords: 'hvac michigan',
  });
  return { ok: true, totalResults: data.pagination?.total_entries };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { fetchHVACLeads, testConnection };
