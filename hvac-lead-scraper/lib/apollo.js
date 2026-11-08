/**
 * Apollo.io API wrapper for HVAC lead search.
 *
 * To add new cities: extend SW_MICHIGAN_CITIES.
 * To change industries: extend TARGET_INDUSTRY_KEYWORDS.
 * To change title priority: reorder TARGET_TITLES.
 *
 * Phone reveal requires Apollo Basic plan ($49/mo) or higher.
 */

const axios = require('axios');

const APOLLO_API_BASE = 'https://api.apollo.io/v1';

// --- Configurable targets ---

// Cities to search, in SW Michigan. Add or remove as needed.
const SW_MICHIGAN_CITIES = [
  'Kalamazoo',
  'Muskegon',
  'Holland',
  'Benton Harbor',
  'St. Joseph',
  'Grand Haven',
  'South Haven',
];

// Job titles to target, in priority order (Owner is most valuable).
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industry keyword tags used to filter Apollo results.
// To target different industries, change these strings.
const TARGET_INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
];

// Title priority map — lower number = higher priority (Owner first).
const TITLE_PRIORITY = Object.fromEntries(
  TARGET_TITLES.map((t, i) => [t.toLowerCase(), i])
);

/**
 * Search Apollo.io for HVAC decision-makers in SW Michigan.
 * Returns leads sorted by title priority, with phone numbers only.
 * @param {number} maxResults - Maximum number of leads to return.
 * @returns {Promise<Array>}
 */
async function searchLeads(maxResults = 50) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const leads = [];
  const perCityBatch = Math.ceil(maxResults / SW_MICHIGAN_CITIES.length);

  for (const city of SW_MICHIGAN_CITIES) {
    if (leads.length >= maxResults) break;

    const remaining = maxResults - leads.length;
    const batchSize = Math.min(perCityBatch, remaining, 25); // Apollo max per_page is 25

    try {
      const response = await axios.post(
        `${APOLLO_API_BASE}/mixed_people/search`,
        {
          api_key: apiKey,
          // Keyword-based industry filter
          q_organization_keyword_tags: TARGET_INDUSTRY_KEYWORDS,
          // Job title filter
          person_titles: TARGET_TITLES,
          // Location filter: city + state
          person_locations: [`${city}, Michigan, United States`],
          // Company size: 1-25 employees (owner-operated)
          organization_num_employees_ranges: ['1,25'],
          // Request phone reveal (requires paid Apollo plan)
          reveal_phone_number: true,
          per_page: batchSize,
          page: 1,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': apiKey,
          },
          timeout: 15000,
        }
      );

      const people = response.data?.people || [];

      for (const person of people) {
        const phone = extractBestPhone(person);
        // Skip anyone with no phone number
        if (!phone) continue;

        leads.push({
          businessName: (person.organization?.name || '').trim(),
          firstName: (person.first_name || '').trim(),
          lastName: (person.last_name || '').trim(),
          phone,
          city: (person.city || city).trim(),
          website: (person.organization?.website_url || '').trim(),
          // Store normalized title for sorting
          _titlePriority: getTitlePriority(person.title || ''),
        });
      }
    } catch (err) {
      // Log city-level errors but keep going; don't abort the whole run
      console.warn(`Apollo search warning for ${city}: ${err.message}`);
    }
  }

  // Sort by title priority (Owner first, then President, etc.)
  leads.sort((a, b) => a._titlePriority - b._titlePriority);

  // Strip the internal sort key before returning
  return leads.slice(0, maxResults).map(({ _titlePriority, ...lead }) => lead);
}

/**
 * Returns the priority rank for a given job title string.
 * Lower = higher priority. Unknown titles get lowest priority.
 */
function getTitlePriority(title) {
  const normalized = title.toLowerCase();
  for (const [key, rank] of Object.entries(TITLE_PRIORITY)) {
    if (normalized.includes(key)) return rank;
  }
  return TARGET_TITLES.length; // Unknown title goes last
}

/**
 * Extracts the best available phone number from an Apollo contact.
 * Preference order: mobile → direct → any → null.
 */
function extractBestPhone(person) {
  const phones = person.phone_numbers || [];

  const mobile = phones.find((p) => p.type === 'mobile');
  if (mobile) return formatPhone(mobile.raw_number || mobile.sanitized_number);

  const direct = phones.find((p) => p.type === 'direct');
  if (direct) return formatPhone(direct.raw_number || direct.sanitized_number);

  if (phones.length > 0) {
    return formatPhone(phones[0].raw_number || phones[0].sanitized_number);
  }

  return null;
}

/**
 * Formats a raw phone string to (XXX) XXX-XXXX.
 * Returns the original string if it can't be formatted.
 */
function formatPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

module.exports = { searchLeads };
