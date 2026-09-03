/**
 * Apollo.io API client
 *
 * Searches for HVAC owner-operated businesses in SW Michigan.
 * Uses the People Search endpoint so we get individual decision-makers
 * with direct/mobile phone numbers rather than generic business lines.
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// Cities to target — add or remove as needed
const SW_MICHIGAN_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

// Normalized for client-side city matching (city names returned by Apollo vary)
const SW_MICHIGAN_CITY_PATTERNS = [
  'st. joseph', 'saint joseph', 'st joseph',
  'benton harbor', 'benton',
  'kalamazoo',
  'holland',
  'grand haven',
  'muskegon',
  'south haven',
];

// Industries to target — Apollo accepts free-text industry strings
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating, Ventilation & Air Conditioning',
  'Plumbing',
  'Mechanical or Industrial Engineering',
  'Mechanical Contracting',
  'Facilities Services',
];

// Job titles in priority order — the order here matters for sorting results
const TITLE_PRIORITY = ['owner', 'president', 'founder', 'co-founder', 'co founder', 'general manager'];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Search Apollo for HVAC leads in SW Michigan.
 * Returns up to `maxResults` lead objects, already deduped by business name.
 *
 * @param {number} maxResults - Cap on results returned (default 25)
 * @returns {Promise<Array>} Array of lead objects
 */
async function searchLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const leads = [];
  const seenBusinesses = new Set();

  // Search city by city to improve SW Michigan precision.
  // Apollo's location filter matches at city level when you include the state.
  for (const city of SW_MICHIGAN_CITIES) {
    if (leads.length >= maxResults) break;

    console.log(`  Searching Apollo for: ${city}, Michigan...`);

    try {
      const cityLeads = await searchCity(apiKey, city, maxResults - leads.length);

      for (const lead of cityLeads) {
        if (leads.length >= maxResults) break;
        const key = lead.businessName.toLowerCase().trim();
        if (key && !seenBusinesses.has(key)) {
          seenBusinesses.add(key);
          leads.push(lead);
        }
      }

      console.log(`    → ${cityLeads.length} results, ${leads.length} total so far`);
    } catch (err) {
      console.warn(`    → Failed for ${city}: ${err.message}`);
    }

    // Respect Apollo rate limits between city requests
    await sleep(600);
  }

  // Sort by title priority so owner-operated contacts bubble up
  return leads.sort((a, b) => titleRank(a.title) - titleRank(b.title));
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function searchCity(apiKey, city, limit) {
  const body = {
    api_key: apiKey,
    page: 1,
    per_page: Math.min(limit, 25), // Apollo max per_page is 25

    // Decision-maker titles only
    person_titles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

    // Company must be in this city (Michigan assumed from location string)
    organization_locations: [`${city}, Michigan, United States`],

    // 1–25 employees = owner-operated
    organization_num_employees_ranges: ['1,25'],

    // Only return contacts that have at least one phone number
    contact_phone_numbers_exists: true,

    // Industry keyword filter
    q_organization_industries: TARGET_INDUSTRIES,
  };

  const response = await apolloPost('/mixed_people/search', body);
  const people = response.people || [];

  const leads = [];
  for (const person of people) {
    const lead = extractLead(person, city);
    if (lead) leads.push(lead);
  }
  return leads;
}

function extractLead(person, searchCity) {
  const phone = getBestPhone(person.phone_numbers || []);
  if (!phone) return null; // Must have a phone number

  const cityFromApollo =
    person.city ||
    person.present_raw_address?.split(',')[0] ||
    person.organization?.city ||
    searchCity;

  return {
    businessName: person.organization?.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    title: person.title || '',
    phone,
    city: titleCase(cityFromApollo || searchCity),
    website: cleanUrl(person.organization?.website_url || ''),
  };
}

/**
 * Prefer mobile > direct > any other type.
 * Returns a formatted US phone string or null.
 */
function getBestPhone(phoneNumbers) {
  const order = ['mobile', 'direct', 'work', 'other'];
  for (const type of order) {
    const match = phoneNumbers.find(p => p.type === type);
    if (match) {
      const formatted = formatPhone(match.raw_number || match.sanitized_number);
      if (formatted) return formatted;
    }
  }
  // Fall back to whatever is first
  if (phoneNumbers.length > 0) {
    return formatPhone(phoneNumbers[0].raw_number || phoneNumbers[0].sanitized_number);
  }
  return null;
}

function formatPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw; // Return as-is if it doesn't match a US pattern
}

function cleanUrl(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

function titleCase(str) {
  return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}

function titleRank(title) {
  if (!title) return 99;
  const lower = title.toLowerCase();
  const idx = TITLE_PRIORITY.findIndex(t => lower.includes(t));
  return idx === -1 ? 99 : idx;
}

async function apolloPost(path, body, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(`${APOLLO_BASE}${path}`, body, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        timeout: 15000,
      });
      return response.data;
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = attempt * 1000;
      console.warn(`    Apollo request failed (attempt ${attempt}), retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchLeads, SW_MICHIGAN_CITIES };
