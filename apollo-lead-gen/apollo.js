/**
 * apollo.js — Apollo.io API client for HVAC lead search + enrichment.
 *
 * Flow:
 *   1. Search the Apollo global people database with HVAC + location + title filters.
 *   2. Bulk-enrich results to retrieve phone numbers (consumes Apollo credits).
 *   3. Return leads with phone numbers only.
 *
 * To change target cities, edit SW_MICHIGAN_LOCATIONS below.
 * To change target job titles, edit TARGET_TITLES below.
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// ── Configurable search parameters ────────────────────────────────────────────

// Cities and surrounding areas in Southwest Michigan.
// Apollo matches these against where the PERSON is located.
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
  'Stevensville, Michigan',
  'Portage, Michigan',
  'Zeeland, Michigan',
];

// Decision-maker titles in priority order.
// Apollo will search for these exact titles (include_similar_titles: false keeps results tight).
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// NAICS code prefix 23822 covers Plumbing, Heating, and Air-Conditioning Contractors.
// Apollo uses prefix matching so 23822 also matches 238220.
const HVAC_NAICS_CODES = ['23822'];

// SIC code 1711: Plumbing, Heating, Air-Conditioning. Broadens results beyond NAICS alone.
const HVAC_SIC_CODES = ['1711', '7623'];

// Keyword tags Apollo indexes on company profiles — catches companies whose NAICS/SIC
// is mis-coded but who self-identify as HVAC or plumbing.
const HVAC_KEYWORD_TAGS = ['hvac', 'heating', 'air conditioning', 'plumbing', 'mechanical'];

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Searches Apollo for HVAC decision-makers in SW Michigan,
 * enriches results to get phone numbers, and returns up to `limit` leads.
 *
 * @param {number} limit - Max leads to return (after filtering no-phone contacts).
 * @returns {Promise<Array<{dateAdded, businessName, firstName, lastName, phone, city, website}>>}
 */
async function searchHVACLeads(limit = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  // Fetch more candidates than needed so dedup + no-phone filtering still yields `limit` results.
  const fetchCount = Math.min(limit * 2, 100);

  console.log(`  Querying Apollo for up to ${fetchCount} HVAC contacts in SW Michigan...`);
  const candidates = await searchPeople(apiKey, fetchCount);

  if (candidates.length === 0) {
    console.log('  Apollo returned 0 candidates.');
    return [];
  }

  console.log(`  Enriching ${candidates.length} contacts for phone numbers (uses Apollo credits)...`);
  const enriched = await bulkEnrichPeople(candidates, apiKey);

  const leads = enriched
    .filter(p => extractPhone(p))      // Must have at least one phone number.
    .filter(p => extractBizName(p))    // Must have a business name.
    .slice(0, limit)
    .map(p => ({
      dateAdded: formatDate(new Date()),
      businessName: extractBizName(p),
      firstName: p.first_name || '',
      lastName: p.last_name || '',
      phone: extractPhone(p),
      city: p.city || extractCityFromAddress(p.organization?.raw_address || '') || '',
      website: p.organization?.website_url || '',
    }));

  console.log(`  ${leads.length} leads with phone numbers ready.`);
  return leads;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

async function searchPeople(apiKey, perPage) {
  const res = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    {
      api_key: apiKey,
      person_titles: TARGET_TITLES,
      include_similar_titles: false,
      person_locations: SW_MICHIGAN_LOCATIONS,
      organization_locations: ['Michigan, United States'],
      organization_num_employees_ranges: ['1,25'],
      organization_naics_codes: HVAC_NAICS_CODES,
      organization_sic_codes: HVAC_SIC_CODES,
      q_organization_keyword_tags: HVAC_KEYWORD_TAGS,
      per_page: perPage,
      page: 1,
    },
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' } }
  );

  return res.data?.people || [];
}

async function bulkEnrichPeople(people, apiKey) {
  // Apollo bulk_match accepts batches of up to 10.
  const BATCH_SIZE = 10;
  const enriched = [];

  for (let i = 0; i < people.length; i += BATCH_SIZE) {
    const batch = people.slice(i, i + BATCH_SIZE);

    const details = batch.map(p => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      organization_name: p.organization?.name || '',
      domain: p.organization?.primary_domain || '',
    }));

    try {
      const res = await axios.post(
        `${APOLLO_BASE}/people/bulk_match`,
        {
          api_key: apiKey,
          details,
          reveal_personal_emails: false,
          reveal_phone_number: true,
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const matches = res.data?.matches || [];
      enriched.push(...matches);
    } catch (err) {
      // Log the batch failure but keep going — a single bad batch shouldn't kill the run.
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      console.warn(`  [WARN] Enrichment batch ${Math.floor(i / BATCH_SIZE) + 1} failed (HTTP ${status}): ${msg}`);

      if (status === 422 && msg?.includes('phone')) {
        console.warn('  [WARN] Your Apollo plan may not include phone number reveal. Upgrade to Basic or above.');
      }
    }

    // Brief pause between batches to respect Apollo rate limits.
    if (i + BATCH_SIZE < people.length) {
      await sleep(400);
    }
  }

  return enriched;
}

function extractPhone(person) {
  // Prefer mobile → direct dial → first available number.
  if (person.mobile_phone) return person.mobile_phone;
  if (person.direct_dial?.sanitized_number) return person.direct_dial.sanitized_number;
  if (Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0) {
    const mobile = person.phone_numbers.find(p => p.type === 'mobile');
    const direct = person.phone_numbers.find(p => p.type === 'direct');
    return (mobile || direct || person.phone_numbers[0])?.sanitized_number || null;
  }
  return null;
}

function extractBizName(person) {
  return (
    person.organization?.name ||
    person.employment_history?.[0]?.organization_name ||
    ''
  ).trim();
}

function extractCityFromAddress(rawAddress) {
  if (!rawAddress) return '';
  // Typical format: "123 Main St, Kalamazoo, MI 49007, USA"
  const parts = rawAddress.split(',').map(s => s.trim());
  // City is the part before "STATE ZIP", skip the last two (state+zip and country).
  return parts.length >= 3 ? parts[parts.length - 3] : '';
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchHVACLeads };
