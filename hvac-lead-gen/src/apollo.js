/**
 * apollo.js — Apollo.io REST API client
 *
 * Searches for HVAC/plumbing/mechanical company owners and decision-makers
 * in Southwest Michigan. Uses the People Search endpoint, then optionally
 * enriches contacts to reveal masked phone numbers if REVEAL_PHONE_NUMBERS=true.
 *
 * To add more cities, update TARGET_CITIES below.
 * To change industries, update SIC_CODES or NAICS_CODES below.
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// ── Configurable: edit these to expand or narrow the target area ───────────
const TARGET_CITIES = [
  'st. joseph', 'saint joseph', 'benton harbor', 'kalamazoo',
  'holland', 'grand haven', 'muskegon', 'south haven',
  // Surrounding communities also included
  'portage', 'paw paw', 'stevensville', 'bridgman', 'coloma',
  'berrien springs', 'niles', 'allegan', 'zeeland', 'spring lake',
  'norton shores', 'jenison', 'hudsonville', 'saugatuck', 'douglas',
];

// SIC codes: 1711 = Plumbing/Heating/AC contractors, 7623 = Refrigeration/AC repair
const SIC_CODES = ['1711', '7623'];

// NAICS codes: 238220 = Plumbing/Heating/AC Contractors
const NAICS_CODES = ['238220'];

// Job titles in priority order — Owner first, then President, etc.
const TITLE_PRIORITY = ['owner', 'president', 'founder', 'co-founder', 'co-owner', 'general manager'];

// Titles sent to Apollo's search filter
const SEARCH_TITLES = ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'];

// ──────────────────────────────────────────────────────────────────────────

/**
 * Main entry point. Returns up to `maxResults` de-duped lead objects.
 */
async function searchHVACLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  const rawLeads = await fetchFromApollo(apiKey, maxResults * 3); // fetch extra so filtering leaves enough
  const filtered = filterByLocation(rawLeads);
  const withPhones = await resolvePhones(apiKey, filtered);

  // Sort by job title priority so Owners appear before GMs
  withPhones.sort((a, b) => a._titlePriority - b._titlePriority);

  // Strip internal fields before returning
  return withPhones.slice(0, maxResults).map(({ _titlePriority, ...rest }) => rest);
}

/**
 * Calls Apollo's People Search endpoint, paginating until we have enough candidates.
 */
async function fetchFromApollo(apiKey, targetCount) {
  const results = [];
  let page = 1;
  const perPage = 50; // max allowed per page

  while (results.length < targetCount) {
    const payload = {
      person_titles: SEARCH_TITLES,
      person_seniorities: ['owner', 'founder', 'c_suite'],
      organization_locations: [
        'Michigan, United States',
        'St. Joseph, Michigan',
        'Kalamazoo, Michigan',
        'Muskegon, Michigan',
        'Holland, Michigan',
      ],
      organization_num_employees_ranges: ['1,25'],
      organization_sic_codes: SIC_CODES,
      organization_naics_codes: NAICS_CODES,
      per_page: perPage,
      page,
    };

    let response;
    try {
      response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'Cache-Control': 'no-cache',
        },
        timeout: 15000,
      });
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      throw new Error(`Apollo search request failed: ${msg}`);
    }

    const { people = [], pagination = {} } = response.data;
    if (!people.length) break;

    results.push(...people);

    // Stop if we've reached the last page
    if (!pagination.total_pages || page >= pagination.total_pages) break;
    page++;

    // Small delay to avoid rate-limit bursts
    await sleep(300);
  }

  return results;
}

/**
 * Filters raw Apollo people to only those in the Southwest Michigan target area
 * and with a valid, non-masked phone number (or a phone that can be enriched).
 */
function filterByLocation(people) {
  return people.filter((person) => {
    const city = (person.city || person.organization?.city || '').toLowerCase();
    const state = (person.state || person.organization?.state || '').toLowerCase();

    // Must be in Michigan
    if (!state.includes('michigan') && state !== 'mi') return false;

    // If city is populated, it must match our target area
    if (city) {
      const matched = TARGET_CITIES.some(
        (tc) => city.includes(tc) || tc.includes(city.split(' ')[0])
      );
      if (!matched) return false;
    }

    return true;
  });
}

/**
 * For each filtered person, attempts to extract a phone number.
 * If REVEAL_PHONE_NUMBERS=true and the number is masked, it enriches via Apollo.
 * Contacts without any phone are dropped.
 */
async function resolvePhones(apiKey, people) {
  const revealEnabled = process.env.REVEAL_PHONE_NUMBERS === 'true';
  const results = [];

  for (const person of people) {
    const phone = extractPhone(person);
    const isMasked = phone ? isMaskedNumber(phone) : true;

    if (phone && !isMasked) {
      // Full phone already available
      results.push(buildLead(person, phone));
    } else if (revealEnabled) {
      // Attempt enrichment to reveal full number (uses 1 Apollo export credit per contact)
      try {
        const enriched = await enrichPerson(apiKey, person.id);
        const enrichedPhone = extractPhone(enriched);
        if (enrichedPhone && !isMaskedNumber(enrichedPhone)) {
          results.push(buildLead(enriched, enrichedPhone));
        }
        await sleep(200);
      } catch (_) {
        // Silently skip contacts that fail enrichment
      }
    }
    // If no phone and enrichment disabled, skip this contact
  }

  return results;
}

/**
 * Apollo People Match/Enrichment endpoint to reveal masked phone numbers.
 */
async function enrichPerson(apiKey, personId) {
  const response = await axios.post(
    `${APOLLO_BASE}/people/match`,
    { id: personId, reveal_phone_number: true },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      timeout: 15000,
    }
  );
  return response.data.person || response.data;
}

/**
 * Extracts the best available phone number from an Apollo person object.
 * Prefers direct/mobile numbers over other types.
 */
function extractPhone(person) {
  if (!person) return '';

  // phone_numbers array: prefer direct_phone or mobile_phone
  if (Array.isArray(person.phone_numbers) && person.phone_numbers.length) {
    const preferred = person.phone_numbers.find(
      (p) => p.type === 'direct_phone' || p.type === 'mobile_phone'
    );
    const num = preferred?.sanitized_number || person.phone_numbers[0]?.sanitized_number || '';
    if (num) return num;
  }

  // Fallback to sanitized_phone field
  return person.sanitized_phone || '';
}

/**
 * Returns true if the phone number contains 'X' placeholders (Apollo's masking pattern).
 */
function isMaskedNumber(phone) {
  return /[Xx]/.test(phone);
}

/**
 * Builds a clean lead object from a raw Apollo person.
 */
function buildLead(person, phone) {
  return {
    businessName: person.organization?.name || person.employment_history?.[0]?.organization_name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: formatPhone(phone),
    city: person.city || person.organization?.city || '',
    website: cleanWebsite(person.organization?.website_url || person.organization?.primary_domain || ''),
    _titlePriority: getTitlePriority(person.title || ''),
  };
}

/**
 * Formats a phone number to a readable (XXX) XXX-XXXX style if it's a 10-digit US number.
 * Leaves international or unusual formats untouched.
 */
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

/**
 * Ensures website starts with https:// and strips trailing slashes.
 */
function cleanWebsite(url) {
  if (!url) return '';
  if (!url.startsWith('http')) url = `https://${url}`;
  return url.replace(/\/$/, '');
}

/**
 * Returns a sort priority for a job title string (lower = higher priority).
 */
function getTitlePriority(title) {
  const t = title.toLowerCase();
  for (let i = 0; i < TITLE_PRIORITY.length; i++) {
    if (t.includes(TITLE_PRIORITY[i])) return i;
  }
  return TITLE_PRIORITY.length;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { searchHVACLeads };
