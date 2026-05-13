/**
 * Apollo.io integration — searches for HVAC decision-makers in Southwest Michigan.
 *
 * Apollo docs: https://apolloio.github.io/apollo-api-docs/
 * Endpoint used: POST /v1/mixed_people/search
 */

const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// ─── Configurable targets ────────────────────────────────────────────────────

// Edit this list to add / remove cities.
const TARGET_CITIES = [
  'St. Joseph',
  'Saint Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven'
];

// Titles searched in this priority order. Apollo returns them mixed; we re-sort
// after fetching so higher-priority titles appear first.
const TITLE_PRIORITY = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'co founder',
  'general manager'
];

// Keywords Apollo uses to match organization industries.
// Add or remove terms here to broaden / narrow the industry filter.
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'heating',
  'air conditioning',
  'plumbing',
  'mechanical contracting',
  'cooling',
  'furnace',
  'refrigeration',
  'ventilation'
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function titlePriority(title = '') {
  const t = title.toLowerCase();
  const idx = TITLE_PRIORITY.findIndex(p => t.includes(p));
  return idx === -1 ? TITLE_PRIORITY.length : idx;
}

function isSWMichiganCity(person) {
  const city = (
    person.city ||
    person.present_raw_address ||
    person.organization?.city ||
    ''
  ).toLowerCase();

  return TARGET_CITIES.some(tc => city.includes(tc.toLowerCase()));
}

function extractPhone(person) {
  // Prefer direct / mobile numbers over switchboards
  return (
    person.mobile_phone ||
    person.phone ||
    person.sanitized_phone ||
    (person.phone_numbers || []).find(p => p.type === 'mobile')?.raw_number ||
    (person.phone_numbers || []).find(p => p.type === 'direct')?.raw_number ||
    (person.phone_numbers || [])[0]?.raw_number ||
    ''
  );
}

function mapToLead(person) {
  return {
    businessName: (person.organization?.name || '').trim(),
    firstName:    (person.first_name || '').trim(),
    lastName:     (person.last_name  || '').trim(),
    phone:        extractPhone(person),
    city:         (person.city || person.organization?.city || '').trim(),
    website:      (person.organization?.website_url || '').trim(),
    title:        (person.title || '').trim()
  };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Fetches up to `maxResults` unique HVAC leads from Apollo.io.
 * Returns an array of plain objects ready to write to Sheets.
 */
async function searchHVACLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  logger.info(`Apollo search starting — target: ${maxResults} leads in Southwest Michigan`);

  const collected = [];
  let page = 1;
  const maxPages = 8; // safety ceiling — avoids runaway API calls

  while (collected.length < maxResults * 3 && page <= maxPages) {
    logger.info(`  Fetching Apollo page ${page}…`);

    let response;
    try {
      response = await axios.post(
        `${APOLLO_BASE_URL}/mixed_people/search`,
        {
          // API key can also go in payload for v1
          api_key: apiKey,

          // Who we want
          person_titles: [
            'Owner', 'President', 'Founder', 'Co-Founder', 'Co Founder', 'General Manager'
          ],

          // Where
          person_locations:       ['Michigan, United States'],
          organization_locations: ['Michigan, United States'],

          // Small / owner-operated businesses only
          organization_num_employees_ranges: ['1,25'],

          // Industry via keyword tags
          q_organization_keyword_tags: INDUSTRY_KEYWORDS,

          // Must have a phone number
          contact_has_phone: true,

          // Pagination — fetch 100 at a time so we can city-filter client-side
          per_page: 100,
          page
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          },
          timeout: 30_000
        }
      );
    } catch (err) {
      const status  = err.response?.status;
      const detail  = err.response?.data?.message || err.message;

      if (status === 422) {
        // Apollo returns 422 when the page is past the last real page
        logger.info('  Apollo: no more pages available.');
        break;
      }
      if (status === 429) {
        logger.warn('  Apollo rate limit hit — waiting 60 s before retry…');
        await new Promise(r => setTimeout(r, 60_000));
        continue; // retry same page
      }
      throw new Error(`Apollo API error (HTTP ${status}): ${detail}`);
    }

    const people = response.data?.people || [];
    if (people.length === 0) {
      logger.info('  Apollo: empty page — done.');
      break;
    }

    // Keep only contacts from our target cities
    const filtered = people.filter(isSWMichiganCity);
    logger.info(`  Page ${page}: ${people.length} results → ${filtered.length} match SW Michigan cities`);

    collected.push(...filtered);
    page++;
  }

  if (collected.length === 0) {
    logger.warn('Apollo returned 0 contacts matching the city filter.');
    return [];
  }

  // Sort by title priority, deduplicate by businessName+lastName within this batch
  const seen = new Set();
  const deduped = collected
    .sort((a, b) => titlePriority(a.title) - titlePriority(b.title))
    .filter(p => {
      const key = `${p.organization?.name || ''}|${p.last_name || ''}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // Map → drop contacts with no phone or no business name
  const leads = deduped
    .map(mapToLead)
    .filter(l => l.phone && l.businessName)
    .slice(0, maxResults);

  logger.info(`Apollo search complete — ${leads.length} leads ready`);
  return leads;
}

/**
 * Lightweight connectivity check — returns true if the API key is valid.
 */
async function testConnection() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set.');

  const res = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/search`,
    { api_key: apiKey, per_page: 1, page: 1 },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 }
  );

  const ok = Array.isArray(res.data?.people);
  if (ok) logger.info('Apollo.io connection: OK');
  return ok;
}

module.exports = { searchHVACLeads, testConnection };
