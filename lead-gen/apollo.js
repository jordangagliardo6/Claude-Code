/**
 * apollo.js — Apollo.io People Search
 *
 * Searches for HVAC / plumbing / mechanical company decision-makers
 * in Southwest Michigan and returns a normalized lead array.
 *
 * To add or remove target cities, edit SW_MICHIGAN_CITIES.
 * To change job title priority, edit TARGET_TITLES.
 */

'use strict';

const axios = require('axios');

const APOLLO_API_BASE = 'https://api.apollo.io/v1';

// ── Target job titles — order = priority ────────────────────────────────────
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ── SW Michigan city list (lowercase for matching) ───────────────────────────
// Add any surrounding towns here to widen or narrow the net.
const SW_MICHIGAN_CITIES = new Set([
  'st. joseph', 'saint joseph', 'st joseph',
  'benton harbor', 'benton heights', 'stevensville', 'bridgman', 'sawyer',
  'three oaks', 'new buffalo', 'buchanan', 'berrien springs',
  'kalamazoo', 'portage', 'comstock', 'vicksburg', 'galesburg',
  'holland', 'zeeland', 'saugatuck', 'douglas', 'fennville',
  'grand haven', 'spring lake', 'ferrysburg', 'coopersville',
  'muskegon', 'norton shores', 'muskegon heights', 'roosevelt park',
  'fruitport', 'twin lake', 'ravenna',
  'south haven', 'hartford', 'coloma', 'watervliet', 'covert',
]);

// ── Per-city search queries sent to Apollo ───────────────────────────────────
// Each entry becomes one API call; results are merged and deduped.
const SEARCH_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// ── Industry keywords sent as q_keywords ─────────────────────────────────────
// Apollo matches these against job titles, company descriptions, and tags.
const INDUSTRY_KEYWORDS = 'HVAC heating cooling "air conditioning" plumbing mechanical contractor';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isSwMichiganCity(city) {
  if (!city) return false;
  return SW_MICHIGAN_CITIES.has(city.toLowerCase().trim());
}

/**
 * Extract the best available phone number from an Apollo person record.
 * Priority: direct > mobile > any other number.
 */
function extractPhone(person) {
  const phones = person.phone_numbers || [];
  if (phones.length === 0) return null;

  const direct = phones.find(p =>
    p.type === 'direct_phone' || p.type === 'work_hq'
  );
  const mobile = phones.find(p =>
    p.type === 'mobile_phone' || p.type === 'personal_phone'
  );
  const chosen = direct || mobile || phones[0];

  // Apollo returns numbers in sanitized_number (digits only) or raw_number
  return chosen.sanitized_number || chosen.raw_number || null;
}

/** Map a raw Apollo person object to our lead schema. */
function mapToLead(person) {
  const org = person.organization || {};
  return {
    businessName : org.name        || '',
    firstName    : person.first_name || '',
    lastName     : person.last_name  || '',
    phone        : extractPhone(person),
    city         : person.city       || org.city || '',
    website      : org.website_url   || '',
    jobTitle     : person.title      || '',
  };
}

/**
 * Sort leads so Owners come first, then Presidents, etc.
 * Contacts with unrecognised titles fall to the bottom.
 */
function sortByTitlePriority(leads) {
  return leads.sort((a, b) => {
    const rank = title => {
      const idx = TARGET_TITLES.findIndex(t =>
        title.toLowerCase().includes(t.toLowerCase())
      );
      return idx === -1 ? TARGET_TITLES.length : idx;
    };
    return rank(a.jobTitle) - rank(b.jobTitle);
  });
}

/**
 * POST one search request to Apollo and return the people array.
 * Returns [] on soft errors (422, empty response) so the caller can continue.
 */
async function apolloSearch(params) {
  const apiKey = process.env.APOLLO_API_KEY;

  try {
    const res = await axios.post(
      `${APOLLO_API_BASE}/mixed_people/search`,
      { api_key: apiKey, ...params },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000,
      }
    );
    return res.data.people || [];
  } catch (err) {
    const status  = err.response?.status;
    const message = err.response?.data?.message || err.message;

    if (status === 422) {
      // Apollo rejects some location strings — log and skip
      console.warn(`  Apollo 422 for location "${params.person_locations?.[0]}": ${message}`);
      return [];
    }
    if (status === 401 || status === 403) {
      throw new Error(`Apollo API key invalid or plan limit reached (${status}).`);
    }
    throw new Error(`Apollo API error (${status ?? 'network'}): ${message}`);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fetch HVAC / plumbing / mechanical leads from Apollo for SW Michigan.
 *
 * @param {number} maxResults  Upper bound on leads returned (before sheet dedup).
 *                             Fetch more than your per-run limit so dedup still
 *                             yields enough after filtering.
 * @returns {Promise<Array>}   Array of lead objects, sorted by title priority.
 */
async function searchHVACLeads(maxResults = 75) {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY environment variable is not set.');
  }

  const accumulated = [];
  const seenThisRun = new Set(); // dedup within the batch

  // ── Phase 1: city-specific searches ──────────────────────────────────────
  for (const location of SEARCH_LOCATIONS) {
    if (accumulated.length >= maxResults) break;

    console.log(`  Searching Apollo: ${location}…`);
    const people = await apolloSearch({
      q_keywords                      : INDUSTRY_KEYWORDS,
      person_titles                   : TARGET_TITLES,
      person_locations                : [location],
      organization_num_employees_ranges: ['1,25'],
      page                            : 1,
      per_page                        : 25,
    });

    console.log(`    → ${people.length} result(s)`);

    for (const person of people) {
      const lead = mapToLead(person);

      if (!lead.phone)         continue; // must have a phone
      if (!lead.businessName)  continue; // must have a business name

      const key = lead.businessName.toLowerCase().trim();
      if (seenThisRun.has(key)) continue;
      seenThisRun.add(key);

      accumulated.push(lead);
    }

    // Be polite to Apollo's rate limits between city searches
    await new Promise(r => setTimeout(r, 600));
  }

  // ── Phase 2: broader Michigan search to catch smaller surrounding towns ───
  if (accumulated.length < maxResults) {
    console.log('  Running broader Michigan search for surrounding towns…');
    const people = await apolloSearch({
      q_keywords                      : INDUSTRY_KEYWORDS,
      person_titles                   : TARGET_TITLES,
      person_locations                : ['Michigan, United States'],
      organization_num_employees_ranges: ['1,25'],
      page                            : 1,
      per_page                        : 50,
    });

    console.log(`    → ${people.length} result(s)`);

    for (const person of people) {
      if (!isSwMichiganCity(person.city)) continue; // filter to SW MI towns only

      const lead = mapToLead(person);
      if (!lead.phone)        continue;
      if (!lead.businessName) continue;

      const key = lead.businessName.toLowerCase().trim();
      if (seenThisRun.has(key)) continue;
      seenThisRun.add(key);

      accumulated.push(lead);
    }
  }

  return sortByTitlePriority(accumulated);
}

module.exports = { searchHVACLeads };
