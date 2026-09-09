/**
 * apollo.js — Apollo.io API client
 *
 * Searches for HVAC / Plumbing / Mechanical decision-makers
 * in Southwest Michigan using the People Search endpoint.
 *
 * To target different cities or industries, edit CITIES and KEYWORDS below.
 */

const axios = require('axios');

// ── Configurable targets ─────────────────────────────────────────────────────

const CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Apollo uses keyword tags to match company industries
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'heating & cooling',
  'air conditioning',
  'plumbing',
  'mechanical contracting',
  'mechanical contractor',
];

// Priority order matters — Apollo returns contacts sorted by relevance,
// so the title list order influences the first results returned.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Company size band: 1–25 employees (owner-operated small businesses)
const EMPLOYEE_RANGES = ['1,25'];

// ── Apollo API helpers ───────────────────────────────────────────────────────

const APOLLO_BASE = 'https://api.apollo.io/v1';

/**
 * Build axios instance with auth header.
 */
function buildClient() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment variables.');

  return axios.create({
    baseURL: APOLLO_BASE,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    timeout: 30_000,
  });
}

/**
 * Fetch one page of matching people from Apollo.
 *
 * @param {number} page     1-based page number
 * @param {number} perPage  Results per page (max 100)
 * @returns {Promise<{ people: object[], pagination: object }>}
 */
async function fetchLeadsPage(page = 1, perPage = 25) {
  const client = buildClient();

  const body = {
    // Titles — owner-level decision makers only
    person_titles: TARGET_TITLES,

    // Company must be in SW Michigan
    organization_locations: CITIES,

    // Industry keywords — Apollo matches on company description/tags
    organization_keyword_tags: INDUSTRY_KEYWORDS,

    // Headcount filter: 1–25 employees
    num_employees_ranges: EMPLOYEE_RANGES,

    // Only return contacts that have at least one phone number
    // (Apollo shows this as a boolean filter on the search page)
    contact_phone_exists: true,

    page,
    per_page: perPage,
  };

  const response = await client.post('/mixed_people/search', body);
  return response.data; // { people: [...], pagination: { ... } }
}

/**
 * Map a raw Apollo person record to our lead schema.
 * Returns null if the record is missing required fields.
 *
 * @param {object} person  Raw Apollo person object
 * @returns {{ businessName, firstName, lastName, phone, city, website } | null}
 */
function mapPersonToLead(person) {
  const org = person.organization || person.employment_history?.[0] || {};
  const businessName = org.name || person.company || '';
  if (!businessName) return null;

  // Phone: prefer mobile → direct → primary_phone
  const phone =
    person.mobile_phone ||
    person.direct_phone ||
    person.primary_phone?.number ||
    person.phone_numbers?.[0]?.sanitized_number ||
    '';

  if (!phone) return null; // skip contacts with no usable phone

  const city =
    person.city ||
    person.present_raw_address?.split(',')[0]?.trim() ||
    org.city ||
    '';

  const website = org.website_url || org.primary_domain || '';

  return {
    businessName: businessName.trim(),
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone: phone.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1'), // strip to 10 digits
    city: city.trim(),
    website: website.trim(),
  };
}

/**
 * Pull up to `maxLeads` new leads from Apollo, deduplicating against
 * the set of business names already in the sheet.
 *
 * @param {Set<string>}  existingNames   Lowercased business names already in sheet
 * @param {number}       maxLeads        Hard cap per run
 * @returns {Promise<Array<object>>}     Ready-to-insert lead rows
 */
async function fetchNewLeads(existingNames, maxLeads) {
  const leads = [];
  let page = 1;
  const perPage = Math.min(maxLeads * 2, 100); // fetch extras to account for filtered-out dupes

  while (leads.length < maxLeads) {
    let data;
    try {
      data = await fetchLeadsPage(page, perPage);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      throw new Error(`Apollo API error (page ${page}): ${msg}`);
    }

    const people = data.people || data.contacts || [];
    if (people.length === 0) break; // no more results

    for (const person of people) {
      if (leads.length >= maxLeads) break;

      const lead = mapPersonToLead(person);
      if (!lead) continue;

      // Duplicate check — case-insensitive match on business name
      if (existingNames.has(lead.businessName.toLowerCase())) continue;

      leads.push(lead);
      existingNames.add(lead.businessName.toLowerCase()); // prevent same-run dupes
    }

    const totalPages = data.pagination?.total_pages || 1;
    if (page >= totalPages) break;
    page++;
  }

  return leads;
}

/**
 * Lightweight connectivity test — fetch 1 result and return success/failure.
 */
async function testConnection() {
  try {
    const data = await fetchLeadsPage(1, 1);
    const count = (data.people || data.contacts || []).length;
    return { ok: true, message: `Apollo connected — ${data.pagination?.total_entries ?? '?'} total matches found.` };
  } catch (err) {
    return { ok: false, message: `Apollo connection failed: ${err.message}` };
  }
}

module.exports = { fetchNewLeads, testConnection };
