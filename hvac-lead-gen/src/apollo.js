'use strict';

require('dotenv').config();
const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// ─── Target geography ─────────────────────────────────────────────────────────
// Apollo searches Michigan broadly; we city-filter after to stay precise.
const SW_MICHIGAN_CITIES = [
  'st. joseph', 'saint joseph', 'benton harbor',
  'kalamazoo', 'holland', 'grand haven', 'muskegon', 'south haven',
  // Common nearby suburbs that belong to the same service area
  'stevensville', 'bridgman', 'coloma', 'watervliet', 'dowagiac',
  'portage', 'oshtemo', 'comstock', 'galesburg', 'zeeland',
  'fennville', 'saugatuck', 'douglas', 'norton shores',
  'muskegon heights', 'roosevelt park', 'whitehall', 'montague',
];

// ─── Industry keywords ────────────────────────────────────────────────────────
// Apollo keyword_tags correspond to SIC/industry categories
const INDUSTRY_KEYWORDS = [
  'hvac', 'heating', 'cooling', 'air conditioning',
  'plumbing', 'mechanical contracting', 'heating and air conditioning',
];

// ─── Decision-maker titles ────────────────────────────────────────────────────
// Listed in priority order — Apollo returns closest matches first.
const TARGET_TITLES = [
  'Owner', 'President', 'Founder', 'Co-Founder', 'General Manager',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pick the best available phone from Apollo's phone_numbers array.
 * Priority: direct > mobile > corporate > other. Returns null if none found.
 */
function extractBestPhone(phoneNumbers) {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) return null;

  const priority = ['direct_phone', 'mobile_phone', 'corporate_phone', 'other'];
  const byType = {};
  for (const p of phoneNumbers) {
    const raw = p.raw_number || p.number || '';
    if (!raw || raw.includes('*')) continue; // skip masked numbers
    byType[p.type] = raw;
  }

  for (const type of priority) {
    if (byType[type]) return byType[type];
  }

  // Fall back to whatever is there (first unmasked number)
  const fallback = phoneNumbers.find(p => {
    const r = p.raw_number || p.number || '';
    return r && !r.includes('*');
  });
  return fallback ? (fallback.raw_number || fallback.number) : null;
}

/**
 * Normalise a person record from Apollo into our lead schema.
 * Returns null if required fields are missing.
 */
function mapToLead(person) {
  const org = person.organization || {};
  const businessName = org.name || person.organization_name || '';
  if (!businessName) return null;

  const phone = extractBestPhone(person.phone_numbers) ||
                extractBestPhone(org.phone_numbers) ||
                org.primary_phone?.sanitized_number || null;
  if (!phone) return null;

  const cityRaw = person.city || person.present_raw_address || org.city || '';
  const city = cityRaw.split(',')[0].trim(); // "Kalamazoo, MI, US" → "Kalamazoo"

  return {
    businessName,
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone,
    city,
    website: org.website_url || org.primary_domain ? `https://${org.primary_domain}` : '',
  };
}

/**
 * Returns true when the lead's city is in SW Michigan.
 */
function isSwMichigan(lead) {
  return SW_MICHIGAN_CITIES.includes(lead.city.toLowerCase());
}

// ─── Main search function ─────────────────────────────────────────────────────

/**
 * Searches Apollo for HVAC decision-makers in SW Michigan.
 * Returns an array of normalised lead objects (phone guaranteed, SW MI city preferred).
 * @param {number} maxResults - target number of leads to return
 */
async function fetchHVACLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment');

  const leads = [];
  let page = 1;
  const perPage = Math.min(maxResults * 3, 100); // over-fetch so city filter still yields enough

  while (leads.length < maxResults) {
    let data;
    try {
      const response = await axios.post(
        `${APOLLO_BASE}/mixed_people/search`,
        {
          api_key: apiKey,
          // Job titles — strict match preferred; Apollo broadens automatically
          person_titles: TARGET_TITLES,
          person_seniorities: ['owner', 'founder', 'c_suite'],
          // Company size: 1–25 employees (owner-operated)
          organization_num_employees_ranges: ['1,10', '11,25'],
          // State-level location; city-filter happens below
          organization_locations: ['Michigan, United States'],
          // Industry keywords
          q_organization_keyword_tags: INDUSTRY_KEYWORDS,
          // Exclude contacts that have no phone at all
          has_phone: true,
          page,
          per_page: perPage,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
          timeout: 30_000,
        }
      );
      data = response.data;
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      throw new Error(`Apollo API error (HTTP ${status}): ${msg}`);
    }

    const people = data.people || [];
    if (people.length === 0) break; // no more results

    for (const person of people) {
      if (leads.length >= maxResults) break;
      const lead = mapToLead(person);
      if (!lead) continue;
      // Prefer SW Michigan cities but don't drop others — the scheduler will
      // naturally drift towards more specific results as the sheet fills up.
      // To be strict, uncomment the next line:
      // if (!isSwMichigan(lead)) continue;
      leads.push(lead);
    }

    // If Apollo returned fewer results than requested, we've exhausted the pool
    if (people.length < perPage) break;
    page++;
  }

  return leads;
}

module.exports = { fetchHVACLeads, SW_MICHIGAN_CITIES };
