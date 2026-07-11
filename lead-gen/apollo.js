/**
 * apollo.js — Apollo.io People Search integration.
 *
 * Searches for HVAC/plumbing business owners in Southwest Michigan
 * using the Apollo REST API v1.
 *
 * Apollo API docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');
const config = require('./config');

const APOLLO_API_BASE = 'https://api.apollo.io/v1';

// Delay between city searches to stay within Apollo rate limits (ms)
const SEARCH_DELAY_MS = 1200;

/**
 * Sleep helper.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pull the best available phone number from a person record.
 * Priority: mobile → direct → corporate → first available.
 *
 * @param {Object} person - Apollo person object
 * @returns {string|null}
 */
function extractBestPhone(person) {
  const phones = person.phone_numbers || [];

  const byType = (type) => phones.find((p) => p.type === type);
  const mobile    = byType('mobile_phone');
  const direct    = byType('direct_phone');
  const corporate = byType('corporate_phone');
  const fallback  = phones[0];

  const winner = mobile || direct || corporate || fallback;
  if (!winner) return null;

  // Prefer sanitized (digits only) but fall back to raw display number
  return winner.sanitized_number || winner.raw_number || null;
}

/**
 * Normalize a phone number to a readable US format: (269) 555-1234.
 * Returns the original string if it can't be normalized.
 *
 * @param {string|null} phone
 * @returns {string}
 */
function formatPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  // Strip leading country code 1 for US numbers
  const local = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return phone;
}

/**
 * Score a title string against the priority table from config.
 * Lower score = higher priority. Unrecognized titles get score 99.
 *
 * @param {string} title
 * @returns {number}
 */
function titleScore(title) {
  if (!title) return 99;
  const normalized = title.toLowerCase().trim();
  for (const [key, score] of Object.entries(config.titlePriority)) {
    if (normalized.includes(key)) return score;
  }
  return 99;
}

/**
 * Map a raw Apollo person object to our normalized lead shape.
 *
 * @param {Object} person - Apollo API person object
 * @returns {Object|null} - Normalized lead or null if required fields missing
 */
function normalizePerson(person) {
  const phone = formatPhone(extractBestPhone(person));
  if (!phone) return null; // Skip contacts with no phone number

  const org = person.organization || {};
  const businessName = org.name || person.employment_history?.[0]?.organization_name || '';
  if (!businessName) return null;

  // City: prefer the person's city, fall back to org city
  const city =
    person.city ||
    person.present_raw_address?.split(',')[0]?.trim() ||
    org.city ||
    '';

  return {
    businessName: businessName.trim(),
    firstName:    (person.first_name || '').trim(),
    lastName:     (person.last_name  || '').trim(),
    phone,
    city,
    website:      org.website_url || '',
    title:        person.title || '',
    titleScore:   titleScore(person.title),
  };
}

/**
 * Search Apollo for HVAC business owners in a single city.
 *
 * @param {string} city - e.g. "Kalamazoo, Michigan, United States"
 * @param {number} page - 1-based page number
 * @returns {Promise<Object[]>} Array of normalized lead objects
 */
async function searchCity(city, page = 1) {
  const payload = {
    api_key: process.env.APOLLO_API_KEY,
    page,
    per_page: config.apolloPageSize,

    // Filter by job titles
    person_titles: config.targetTitles,

    // Filter by company employee count (1–25)
    organization_num_employees_ranges: [config.employeeRange],

    // Location: this city only
    person_locations: [city],

    // Industry keyword tags
    q_organization_keyword_tags: config.industries,
  };

  const response = await axios.post(
    `${APOLLO_API_BASE}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    }
  );

  const people = response.data?.people || [];
  const leads  = people.map(normalizePerson).filter(Boolean);

  console.log(`  [Apollo] ${city}: ${people.length} results → ${leads.length} with phone`);
  return leads;
}

/**
 * Run searches across all target cities and return a deduplicated, sorted
 * list of leads — capped at maxLeadsPerRun before sheet-dedup.
 *
 * Leads are sorted by title priority so Owners appear before General Managers.
 *
 * @returns {Promise<Object[]>}
 */
async function fetchAllLeads() {
  const seen       = new Set(); // deduplicate by business name within this run
  const allLeads   = [];

  for (const city of config.targetCities) {
    let cityLeads;
    try {
      cityLeads = await searchCity(city);
    } catch (err) {
      // Log the city-level error but continue with remaining cities
      const status  = err.response?.status;
      const message = err.response?.data?.message || err.message;
      console.error(`  [Apollo] ERROR searching "${city}" (HTTP ${status || '?'}): ${message}`);

      // Surface rate-limit errors clearly
      if (status === 429) {
        console.error('  [Apollo] Rate limit hit — stopping city loop early.');
        break;
      }
      await sleep(SEARCH_DELAY_MS * 2);
      continue;
    }

    for (const lead of cityLeads) {
      const key = lead.businessName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        allLeads.push(lead);
      }
    }

    // Polite delay between city requests
    await sleep(SEARCH_DELAY_MS);
  }

  // Sort by title priority so highest-value contacts come first
  allLeads.sort((a, b) => a.titleScore - b.titleScore);

  console.log(`[Apollo] Total unique leads found across all cities: ${allLeads.length}`);
  return allLeads;
}

/**
 * Quick connectivity check — fetches 1 result to verify the API key works.
 * Returns true on success, throws on auth/network failure.
 */
async function testConnection() {
  const response = await axios.post(
    `${APOLLO_API_BASE}/mixed_people/search`,
    {
      api_key:  process.env.APOLLO_API_KEY,
      page:     1,
      per_page: 1,
      person_titles: ['Owner'],
      person_locations: ['Michigan, United States'],
    },
    {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      timeout: 15_000,
    }
  );

  if (response.status !== 200) {
    throw new Error(`Unexpected status ${response.status}`);
  }
  return true;
}

module.exports = { fetchAllLeads, testConnection };
