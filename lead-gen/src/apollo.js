/**
 * apollo.js — Apollo.io API integration
 *
 * Searches for HVAC decision-makers in Southwest Michigan.
 * Docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// Southwest Michigan cities we care about (post-filter since Apollo's city
// filtering is imprecise at the city level for small markets).
const SW_MICHIGAN_CITIES = new Set([
  'st. joseph', 'saint joseph', 'benton harbor', 'kalamazoo',
  'holland', 'grand haven', 'muskegon', 'south haven',
  'stevensville', 'bridgman', 'coloma', 'watervliet', 'bangor',
  'portage', 'comstock', 'paw paw', 'allegan', 'zeeland',
  'saugatuck', 'douglas', 'fennville', 'spring lake',
  'norton shores', 'muskegon heights', 'whitehall', 'montague',
]);

// Titles in priority order — we take the first match found per company.
const TARGET_TITLES = ['owner', 'president', 'founder', 'co-founder', 'general manager'];

// Industry keywords Apollo recognizes in its keyword tag system.
const INDUSTRY_KEYWORDS = [
  'HVAC', 'Heating', 'Air Conditioning', 'Plumbing',
  'Mechanical Contracting', 'Heating and Cooling',
];

/**
 * Score a job title by priority (lower = higher priority).
 * Returns Infinity if the title doesn't match any target.
 */
function titlePriority(title) {
  if (!title) return Infinity;
  const lower = title.toLowerCase();
  for (let i = 0; i < TARGET_TITLES.length; i++) {
    if (lower.includes(TARGET_TITLES[i])) return i;
  }
  return Infinity;
}

/**
 * Extract the best phone number from Apollo's phone_numbers array.
 * Prefers mobile > direct > work > any.
 */
function pickPhone(phoneNumbers) {
  if (!phoneNumbers || phoneNumbers.length === 0) return null;
  const priority = ['mobile', 'direct_phone', 'work_hq'];
  for (const type of priority) {
    const match = phoneNumbers.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  // Fall back to first available number
  const fallback = phoneNumbers.find(p => p.sanitized_number);
  return fallback ? fallback.sanitized_number : null;
}

/**
 * Check whether a person's city falls within our SW Michigan target area.
 */
function isInTargetArea(person) {
  const city = (person.city || person.organization?.city || '').toLowerCase().trim();
  const state = (person.state || person.organization?.state || '').toLowerCase();
  if (!state.includes('michigan') && state !== 'mi') return false;
  // Accept any Michigan city that matches our list, or accept all Michigan if
  // the city field is empty (Apollo sometimes omits it for small markets).
  if (!city) return true;
  return SW_MICHIGAN_CITIES.has(city);
}

/**
 * Run one page of Apollo people search.
 * Returns { people, total_entries }.
 */
async function searchPage(apiKey, page, perPage) {
  const payload = {
    api_key: apiKey,
    q_keywords: INDUSTRY_KEYWORDS.join(' OR '),
    person_titles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],
    organization_locations: ['Michigan, United States'],
    // 1–25 employees
    organization_num_employees_ranges: ['1,25'],
    page,
    per_page: perPage,
  };

  const response = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30000,
    }
  );

  return {
    people: response.data.people || [],
    total_entries: response.data.pagination?.total_entries || 0,
  };
}

/**
 * Fetch up to `maxLeads` qualified leads from Apollo.
 *
 * Strategy: fetch pages until we have enough SW Michigan leads with phones,
 * or we exhaust results (max 5 pages to stay within API rate limits).
 *
 * @param {string} apiKey
 * @param {number} maxLeads
 * @returns {Promise<Array>} Normalized lead objects
 */
async function fetchLeads(apiKey, maxLeads = 25) {
  const leads = [];
  const seenCompanies = new Set(); // dedupe within a single run
  const perPage = Math.min(maxLeads * 3, 100); // cast a wider net then filter
  const maxPages = 5;

  for (let page = 1; page <= maxPages && leads.length < maxLeads; page++) {
    let result;
    try {
      result = await searchPage(apiKey, page, perPage);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      throw new Error(`Apollo API error on page ${page}: ${msg}`);
    }

    if (result.people.length === 0) break; // no more results

    // Filter and normalize
    for (const person of result.people) {
      if (leads.length >= maxLeads) break;

      const phone = pickPhone(person.phone_numbers);
      if (!phone) continue; // must have a phone number

      if (!isInTargetArea(person)) continue;

      const companyName = (person.organization_name || person.organization?.name || '').trim();
      if (!companyName) continue;
      if (seenCompanies.has(companyName.toLowerCase())) continue;

      seenCompanies.add(companyName.toLowerCase());

      leads.push({
        businessName: companyName,
        firstName: person.first_name || '',
        lastName: person.last_name || '',
        phone,
        city: person.city || person.organization?.city || '',
        website: person.organization?.website_url || '',
        title: person.title || '',
      });
    }

    // Avoid hammering the API between pages
    if (page < maxPages && leads.length < maxLeads) {
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  // Sort by title priority so Owners appear before General Managers, etc.
  leads.sort((a, b) => titlePriority(a.title) - titlePriority(b.title));

  return leads;
}

module.exports = { fetchLeads };
