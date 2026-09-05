/**
 * apolloSearch.js
 * Wraps the Apollo.io REST API to search for HVAC company owners in SW Michigan.
 * Requires a paid Apollo plan — the people search endpoint is not available on Free.
 * Docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

/**
 * Build the POST body for Apollo's /mixed_people/search endpoint.
 * Searches one city at a time to keep results geographically precise.
 *
 * @param {string} city - e.g. "Kalamazoo, Michigan"
 * @param {number} page - 1-based page number for pagination
 */
function buildSearchPayload(city, page = 1) {
  return {
    // Location of the PERSON (where they work, not company HQ)
    person_locations: ['Michigan, United States'],

    // Location of the company HQ — biases toward the target city
    organization_locations: [city, 'Michigan, United States'],

    // Job titles — Owner/President/Founder/GM in priority order (OR filter)
    person_titles: config.jobTitles,

    // Include contacts with similar titles (e.g. "Co-Owner", "Managing Partner")
    include_similar_titles: true,

    // Industry keyword tags
    q_organization_keyword_tags: config.industryKeywords,

    // SIC codes for HVAC/Plumbing
    organization_sic_codes: config.sicCodes,

    // NAICS codes for plumbing/HVAC contractors
    organization_naics_codes: config.naicsCodes,

    // Company size: 1–25 employees (owner-operated small businesses)
    organization_num_employees_ranges: config.employeeRanges,

    // Only return contacts where Apollo has a phone number
    // Note: phone enrichment is separate — this filters to people Apollo has data on
    contact_email_status: [], // no email filter

    per_page: config.apolloPageSize,
    page,
  };
}

/**
 * Search Apollo for HVAC leads in one city.
 * Returns an array of raw Apollo person objects.
 *
 * @param {string} city
 * @param {number} page
 * @returns {Promise<{people: Array, totalEntries: number}>}
 */
async function searchCity(city, page = 1) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const payload = buildSearchPayload(city, page);

  const response = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      timeout: 30000,
    }
  );

  const { people = [], pagination = {} } = response.data;
  return {
    people,
    totalEntries: pagination.total_entries || 0,
  };
}

/**
 * Extract the best available phone number from an Apollo person record.
 * Prefers mobile/direct over main business line, and skips entries with no phone.
 *
 * @param {object} person - raw Apollo person record
 * @returns {string|null}
 */
function extractPhone(person) {
  // Apollo returns phone_numbers as an array of {raw_number, type, position}
  const phones = person.phone_numbers || [];

  // Priority: mobile > direct_phone > work_hq > other
  const priority = ['mobile', 'direct_phone', 'work_hq', 'work', 'other'];

  for (const type of priority) {
    const match = phones.find((p) => p.type === type && p.raw_number);
    if (match) return match.raw_number;
  }

  // Fall back to sanitized_phone (Apollo's best guess)
  return person.sanitized_phone || null;
}

/**
 * Extract the city from a person record (organization city preferred, then person city).
 *
 * @param {object} person
 * @returns {string}
 */
function extractCity(person) {
  const orgCity =
    person.organization?.city ||
    person.account?.city ||
    '';
  return orgCity || person.city || '';
}

/**
 * Normalize a raw Apollo person into the flat lead object our sheet expects.
 *
 * @param {object} person - raw Apollo person record
 * @returns {object|null} - null if no phone number found (filtered out)
 */
function normalizeLead(person) {
  const phone = extractPhone(person);
  if (!phone) return null; // skip contacts with no phone

  const city = extractCity(person);

  // Only keep leads in a SW Michigan city (loose check — Apollo location filters aren't always exact)
  const swMichiganCities = config.cities.map((c) => c.split(',')[0].toLowerCase());
  const isSWMich = swMichiganCities.some((c) => city.toLowerCase().includes(c));
  // Still include it if it passes Apollo's location filter — don't over-filter here
  // The strict filtering is done via Apollo's API parameters

  const website =
    person.organization?.website_url ||
    person.account?.website_url ||
    person.organization?.primary_domain ||
    '';

  return {
    businessName: person.organization_name || person.account?.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone,
    city,
    website: website.startsWith('http') ? website : website ? `https://${website}` : '',
  };
}

/**
 * Pull up to maxLeads normalized leads across all configured cities.
 * Stops early once maxLeads is reached.
 *
 * @param {Set<string>} existingNames - business names already in the sheet (for dedup)
 * @param {number} maxLeads
 * @returns {Promise<Array>}
 */
async function fetchLeads(existingNames, maxLeads) {
  const collected = [];
  const seen = new Set(existingNames); // track names we've already processed this run

  for (const city of config.cities) {
    if (collected.length >= maxLeads) break;

    console.log(`  Searching Apollo: ${city}...`);

    let page = 1;
    let hasMore = true;

    while (hasMore && collected.length < maxLeads) {
      let people, totalEntries;

      try {
        ({ people, totalEntries } = await searchCity(city, page));
      } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.error || err.message;

        if (status === 403 || (msg && msg.includes('not included in your'))) {
          throw new Error(
            `Apollo plan error: ${msg}\n` +
            `The people search API requires a paid Apollo plan.\n` +
            `Upgrade at https://www.apollo.io/pricing`
          );
        }

        console.error(`  Apollo error for ${city} page ${page}: ${msg}`);
        break; // skip this city on error, continue with others
      }

      console.log(`    Page ${page}: ${people.length} results (${totalEntries} total)`);

      for (const person of people) {
        if (collected.length >= maxLeads) break;

        const lead = normalizeLead(person);
        if (!lead) continue; // no phone

        const nameKey = lead.businessName.trim().toLowerCase();
        if (!nameKey) continue; // no business name
        if (seen.has(nameKey)) continue; // duplicate

        seen.add(nameKey);
        collected.push(lead);
      }

      // Check if there are more pages
      hasMore = people.length === config.apolloPageSize && totalEntries > page * config.apolloPageSize;
      page++;

      // Small delay between pages to be kind to Apollo's rate limits
      if (hasMore) await sleep(500);
    }

    // Delay between cities
    if (collected.length < maxLeads) await sleep(300);
  }

  return collected;
}

/**
 * Smoke-test the Apollo API key by fetching a single result.
 * Returns { ok: true } or { ok: false, error: string }.
 */
async function testConnection() {
  try {
    await searchCity(config.cities[0], 1);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err.response?.data?.error || err.message,
    };
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { fetchLeads, testConnection };
