/**
 * apollo.js
 * Apollo.io API wrapper for HVAC lead prospecting.
 *
 * Flow:
 *   1. searchHVACPeople()  — finds owners/GMs at HVAC companies in SW Michigan
 *   2. enrichWithPhones()  — bulk-enriches those results to reveal phone numbers
 *   3. formatLeads()       — normalises the enriched data into spreadsheet rows
 */

const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/api/v1';

// Target titles in priority order (Owner first, GM last)
const TITLES = ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'];

// Person locations — SW Michigan cities and close suburbs
// Apollo matches against the PERSON's city, not the company HQ.
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
  'Stevensville, Michigan, United States',
  'Portage, Michigan, United States',
  'Oshtemo, Michigan, United States',
  'Michigan, United States',
];

// Industry keyword tags Apollo uses to categorise companies
const HVAC_KEYWORDS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Heating, Ventilation & Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Heating',
  'Air Conditioning',
  'Ventilation',
];

// SIC codes for HVAC / plumbing / mechanical trades
const HVAC_SIC_CODES = [
  '1711', // Plumbing, Heating, Air-Conditioning
  '7623', // Refrigeration and Air-Conditioning Service and Repair
  '5075', // Warm Air Heating and Air-Conditioning Equipment and Supplies
];

/**
 * Step 1 — search Apollo's people database.
 * Returns an array of basic person objects (no phone numbers yet).
 */
async function searchHVACPeople(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set');

  const payload = {
    api_key: apiKey,
    per_page: Math.min(maxResults, 100),
    page: 1,

    // Job title filter
    person_titles: TITLES,
    include_similar_titles: true, // also catches "owner-operator", "managing partner", etc.

    // Location: match against where the person is based
    person_locations: SW_MICHIGAN_LOCATIONS,

    // Industry filters (both keyword tags and SIC codes for wider coverage)
    q_organization_keyword_tags: HVAC_KEYWORDS,
    organization_sic_codes: HVAC_SIC_CODES,

    // Company size: 1–25 employees
    organization_num_employees_ranges: ['1,25'],
  };

  try {
    const response = await axios.post(`${BASE_URL}/mixed_people/search`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const people = response.data?.people ?? [];
    console.log(`[Apollo] Search returned ${people.length} candidates`);
    return people;
  } catch (err) {
    const detail = err.response?.data?.message ?? err.message;
    throw new Error(`Apollo people search failed: ${detail}`);
  }
}

/**
 * Step 2 — bulk-enrich to reveal phone numbers.
 * Each match costs 1 Apollo export credit; skip if people array is empty.
 *
 * Returns enriched person objects. People with no phone data are included
 * so the caller can decide what to do with them (we filter later).
 */
async function enrichWithPhones(people) {
  if (!people.length) return [];

  const apiKey = process.env.APOLLO_API_KEY;

  // Build the minimal detail objects Apollo needs to match each person
  const details = people.map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    organization_name: p.organization?.name ?? p.employment_history?.[0]?.organization_name,
    domain: p.organization?.primary_domain,
  }));

  try {
    const response = await axios.post(
      `${BASE_URL}/people/bulk_match`,
      {
        api_key: apiKey,
        details,
        reveal_phone_number: true, // requires Basic plan or higher
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
      }
    );

    const matches = response.data?.matches ?? [];
    console.log(`[Apollo] Enriched ${matches.length} records`);
    return matches;
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message ?? err.message;

    // 422 often means "plan doesn't support phone reveal" — degrade gracefully
    if (status === 422 || status === 403) {
      console.warn(
        `[Apollo] Phone enrichment unavailable (${status}): ${detail}. ` +
        'Returning search results without phone numbers.'
      );
      return people; // fall back to basic search data
    }

    throw new Error(`Apollo enrichment failed: ${detail}`);
  }
}

/**
 * Step 3 — pick the best phone number and shape into a flat lead object.
 * Priority: mobile > direct > any other type.
 */
function formatLeads(enrichedPeople) {
  const leads = [];

  for (const person of enrichedPeople) {
    const phones = person.phone_numbers ?? [];

    // Sort: mobile first, then direct, then anything else
    const sorted = [...phones].sort((a, b) => {
      const rank = { mobile: 0, direct: 1 };
      const ra = rank[a.type] ?? 2;
      const rb = rank[b.type] ?? 2;
      return ra - rb;
    });

    const bestPhone = sorted[0]?.sanitized_number ?? sorted[0]?.raw_number ?? null;

    // Determine the city from person location or org location
    const city =
      person.city ??
      person.organization?.city ??
      '';

    // Only keep Michigan leads (extra safety against wide location matches)
    const state = (person.state ?? person.organization?.state ?? '').toUpperCase();
    if (state && state !== 'MI' && !state.includes('MICHIGAN')) continue;

    leads.push({
      firstName: person.first_name ?? '',
      lastName: person.last_name ?? '',
      businessName: person.organization?.name ?? person.employment_history?.[0]?.organization_name ?? '',
      phone: bestPhone,
      city: toTitleCase(city),
      website: cleanUrl(person.organization?.website_url ?? person.organization?.primary_domain),
      apolloId: person.id,
    });
  }

  return leads;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}

function cleanUrl(raw) {
  if (!raw) return '';
  try {
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
}

module.exports = { searchHVACPeople, enrichWithPhones, formatLeads };
