/**
 * Apollo.io REST API client.
 *
 * Flow:
 *  1. mixedPeopleSearch()  — returns candidate list (no phones yet)
 *  2. enrichPerson()       — costs 1 Apollo credit, reveals phone numbers
 *  3. fetchLeads()         — orchestrates both, returns sheet-ready lead objects
 *
 * To change the target cities or industries, edit the constants below.
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// ─── Targeting Configuration ──────────────────────────────────────────────────
// Edit these arrays to adjust your search criteria.

/** Job titles to target, in priority order. */
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

/**
 * SW Michigan cities.
 * Apollo accepts "City, State, Country" strings for organization location filtering.
 * Add or remove cities here without touching any other file.
 */
const TARGET_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

/**
 * Industry keyword tags Apollo uses to classify companies.
 * These map to Apollo's internal taxonomy — broader is safer for small markets.
 */
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'heating & cooling',
  'plumbing',
  'mechanical contracting',
  'air conditioning',
];
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search the Apollo people database for HVAC decision-makers.
 * Returns basic profile data — phones are NOT included here.
 *
 * @param {string} apiKey
 * @param {number} perPage  Results per page (max 100)
 * @param {number} page     Page number for pagination
 * @returns {Promise<{people: Array, pagination: object}>}
 */
async function mixedPeopleSearch(apiKey, perPage = 100, page = 1) {
  const { data } = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    {
      person_titles: TARGET_TITLES,
      include_similar_titles: true,
      person_seniorities: ['owner', 'founder', 'c_suite'],
      organization_locations: TARGET_LOCATIONS,
      organization_num_employees_ranges: ['1,10', '11,25'],
      q_organization_keyword_tags: INDUSTRY_KEYWORDS,
      per_page: perPage,
      page,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'Cache-Control': 'no-cache',
      },
    }
  );
  return data;
}

/**
 * Enrich a single person by Apollo ID to reveal their phone numbers.
 * Costs 1 Apollo phone credit per successful call.
 *
 * @param {string} apiKey
 * @param {string} personId  Apollo person ID from search results
 * @returns {Promise<object|null>}  Enriched person object, or null on failure
 */
async function enrichPerson(apiKey, personId) {
  const { data } = await axios.post(
    `${APOLLO_BASE}/people/match`,
    {
      id: personId,
      reveal_personal_emails: false,
      reveal_phone_number: true,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'Cache-Control': 'no-cache',
      },
    }
  );
  return data.person || null;
}

/**
 * Select the best phone number from Apollo's phone_numbers array.
 * Priority: mobile > direct > work > first available.
 *
 * @param {Array} phoneNumbers  Array of {type, raw_number} objects
 * @returns {string|null}
 */
function pickBestPhone(phoneNumbers) {
  if (!phoneNumbers || phoneNumbers.length === 0) return null;
  const priority = ['mobile', 'direct', 'work'];
  for (const type of priority) {
    const found = phoneNumbers.find(p => p.type === type && p.sanitized_number);
    if (found) return found.sanitized_number;
  }
  // Fall back to any available number
  const fallback = phoneNumbers.find(p => p.sanitized_number || p.raw_number);
  return fallback?.sanitized_number || fallback?.raw_number || null;
}

/**
 * Main entry point: search + enrich + filter, returning up to `maxLeads`
 * contacts that have a confirmed phone number.
 *
 * @param {string} apiKey
 * @param {number} maxLeads  Hard cap on leads returned
 * @returns {Promise<Array<{businessName, firstName, lastName, phone, city, website}>>}
 */
async function fetchLeads(apiKey, maxLeads = 25) {
  const leads = [];
  let page = 1;

  console.log(`[Apollo] Searching SW Michigan HVAC leads (target: ${maxLeads} with phones)...`);

  // We fetch more candidates than needed because many won't have phone numbers.
  // Apollo's enrichment credit is only spent when reveal_phone_number=true returns a phone.
  // We stop as soon as we have enough phone-confirmed leads.
  while (leads.length < maxLeads) {
    let searchData;
    try {
      searchData = await mixedPeopleSearch(apiKey, 50, page);
    } catch (err) {
      const msg = `Apollo search request failed (page ${page}): ${err.response?.data?.message || err.message}`;
      throw new Error(msg);
    }

    const people = searchData.people || [];
    if (people.length === 0) {
      console.log(`[Apollo] No more results at page ${page}. Total enriched: ${leads.length}`);
      break;
    }

    console.log(`[Apollo] Page ${page}: ${people.length} candidates found. Enriching for phones...`);

    for (const person of people) {
      if (leads.length >= maxLeads) break;
      if (!person.id) continue;

      let enriched;
      try {
        enriched = await enrichPerson(apiKey, person.id);
        await sleep(350); // ~3 req/sec — stay well within Apollo rate limits
      } catch (err) {
        console.warn(`[Apollo] Skipping ${person.id}: enrichment error — ${err.response?.data?.message || err.message}`);
        continue;
      }

      if (!enriched) continue;

      const phone = pickBestPhone(enriched.phone_numbers);
      if (!phone) {
        // Contact excluded per spec: no phone number
        continue;
      }

      const websiteUrl =
        enriched.organization?.website_url ||
        enriched.present_raw_address ||
        '';

      leads.push({
        businessName: (enriched.organization_name || person.organization_name || '').trim(),
        firstName: (enriched.first_name || '').trim(),
        lastName: (enriched.last_name || '').trim(),
        phone,
        city: (enriched.city || person.city || '').trim(),
        website: websiteUrl.trim(),
      });

      console.log(
        `[Apollo] ✓ ${enriched.first_name} ${enriched.last_name} ` +
        `@ ${enriched.organization_name} — ${phone}`
      );
    }

    // Apollo returned a partial page — no more data to paginate
    if (people.length < 50) break;
    page++;
  }

  console.log(`[Apollo] Done — ${leads.length} leads with phone numbers collected.`);
  return leads;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { fetchLeads };
