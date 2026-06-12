/**
 * apollo.js — Apollo.io REST API integration.
 *
 * Uses the People Search endpoint to find HVAC decision-makers in SW Michigan,
 * then normalizes the raw results into the shape the rest of the app expects.
 *
 * Apollo REST docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pick the best phone number from Apollo's phone_numbers array.
 * Priority: mobile → direct → work_hq → anything else.
 * Returns the sanitized (digits-only) number string, or null if none found.
 */
function extractBestPhone(phoneNumbers = []) {
  if (!phoneNumbers.length) return null;

  const priority = ['mobile', 'direct', 'work_hq', 'other'];
  for (const type of priority) {
    const match = phoneNumbers.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }

  // Fall back to whatever is first
  return phoneNumbers[0]?.sanitized_number || phoneNumbers[0]?.raw_number || null;
}

/**
 * Extract city from a person record.
 * Checks person.city, then their organization's city, then parses the raw address.
 */
function extractCity(person) {
  if (person.city) return person.city;

  const org = person.organization || person.account || {};
  if (org.city) return org.city;

  if (person.present_raw_address) {
    const parts = person.present_raw_address.split(',');
    if (parts.length >= 2) return parts[parts.length - 2].trim();
  }

  return '';
}

// ── Apollo API calls ──────────────────────────────────────────────────────────

/**
 * Build the JSON payload for POST /v1/mixed_people/search.
 * All search filters live here — edit config.js to change targets.
 */
function buildSearchPayload(page) {
  return {
    page,
    per_page: 100, // max per page; we cap at maxLeadsPerRun after dedup
    person_titles: config.targetTitles,
    // Include owner/founder seniority to bias Apollo's ranking
    person_seniorities: ['owner', 'c_suite', 'founder'],
    organization_locations: config.targetCities,
    organization_num_employees_ranges: config.companySizeRanges,
    // Industry classification — use both SIC and NAICS for broader coverage
    organization_sic_codes: config.sicCodes,
    organization_naics_codes: config.naicsCodes,
    // Keyword tags as a fallback net for companies not tagged with official codes
    q_organization_keyword_tags: config.industryKeywords,
    // Note: Apollo doesn't have a direct "has_phone" filter on the people
    // search endpoint. We filter out phone-less contacts in normalizeLeads().
  };
}

/**
 * Hit the Apollo people search endpoint, paginating until we have enough
 * raw records to satisfy maxLeadsPerRun (accounting for no-phone drops + dedup).
 * Fetches up to 3× maxLeadsPerRun raw records before normalizing.
 */
async function searchRawPeople() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY environment variable is not set.');
  }

  const rawPeople = [];
  const fetchCap = config.maxLeadsPerRun * 3; // buffer for filtering
  let page = 1;

  while (rawPeople.length < fetchCap) {
    const payload = buildSearchPayload(page);

    const response = await axios.post(
      `${APOLLO_BASE}/mixed_people/search`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        timeout: 30_000,
      }
    );

    const { people = [], pagination = {} } = response.data;

    if (!people.length) break; // no more results

    rawPeople.push(...people);

    const totalAvailable = pagination.total_entries ?? people.length;
    if (rawPeople.length >= totalAvailable) break; // fetched everything

    page++;
    if (page > 5) break; // hard page limit to keep credit usage reasonable
  }

  return rawPeople;
}

// ── Normalization ─────────────────────────────────────────────────────────────

/**
 * Convert raw Apollo person objects into clean lead records.
 * Contacts without a phone number are silently dropped (per requirements).
 */
function normalizeLeads(rawPeople) {
  const leads = [];

  for (const person of rawPeople) {
    const phone = extractBestPhone(person.phone_numbers);
    if (!phone) continue; // skip contacts with no phone

    const org = person.organization || person.account || {};

    leads.push({
      businessName: (org.name || person.organization_name || '').trim(),
      firstName: (person.first_name || '').trim(),
      lastName: (person.last_name || '').trim(),
      phone,
      city: extractCity(person),
      website: (org.website_url || person.website_url || '').trim(),
    });
  }

  return leads;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch and normalize HVAC leads from Apollo.
 * Returns an array of lead objects (may be empty — caller handles that case).
 */
async function fetchLeads() {
  const rawPeople = await searchRawPeople();
  return normalizeLeads(rawPeople);
}

module.exports = { fetchLeads };
