'use strict';

const axios = require('axios');
const {
  TARGET_CITIES,
  TARGET_INDUSTRIES,
  TARGET_TITLES,
  EMPLOYEE_RANGE,
  MAX_LEADS_PER_RUN,
  PHONE_TYPE_PRIORITY,
} = require('./config');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pick the best available phone number from a person object.
 * Apollo may surface numbers as top-level fields or inside phone_numbers[].
 */
function extractBestPhone(person) {
  // Top-level shorthand fields Apollo sometimes populates
  for (const field of PHONE_TYPE_PRIORITY) {
    if (person[field]) return person[field];
  }

  // Fall back to the phone_numbers array (enriched results)
  const phones = person.phone_numbers || [];
  if (phones.length === 0) return null;

  // Prefer direct/mobile types over others
  const typeOrder = ['direct_phone', 'mobile_phone', 'work_phone', 'other'];
  for (const t of typeOrder) {
    const match = phones.find((p) => p.type === t && p.sanitized_number);
    if (match) return match.sanitized_number;
  }

  // Return whichever number is first if none matched by type
  return phones[0].sanitized_number || phones[0].raw_number || null;
}

/**
 * Determine the city label for a person.
 * Prefers the person's city; falls back to their organization's city.
 */
function extractCity(person) {
  const city = person.city || (person.organization && person.organization.city);
  const state = person.state || (person.organization && person.organization.state);
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  return '';
}

/**
 * Map a raw Apollo person object to our lead shape.
 * Returns null if the person has no usable phone number.
 */
function mapPersonToLead(person) {
  const phone = extractBestPhone(person);
  if (!phone) return null;

  const org = person.organization || {};

  return {
    businessName: org.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone,
    city: extractCity(person),
    website: org.website_url || '',
    title: person.title || '',
  };
}

/**
 * Sort leads by job title priority so Owners appear before Presidents, etc.
 */
function sortByTitlePriority(leads) {
  return leads.sort((a, b) => {
    const ai = TARGET_TITLES.findIndex(
      (t) => t.toLowerCase() === (a.title || '').toLowerCase()
    );
    const bi = TARGET_TITLES.findIndex(
      (t) => t.toLowerCase() === (b.title || '').toLowerCase()
    );
    const ap = ai === -1 ? TARGET_TITLES.length : ai;
    const bp = bi === -1 ? TARGET_TITLES.length : bi;
    return ap - bp;
  });
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Fetch up to MAX_LEADS_PER_RUN HVAC leads from Apollo.io.
 * Uses city-level location targeting for Southwest Michigan.
 * Excludes any contact with no phone number.
 *
 * @returns {Promise<Array>} Array of lead objects
 */
async function fetchLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment variables.');

  console.log('[Apollo] Searching for HVAC leads in Southwest Michigan…');
  console.log(`[Apollo] Targeting ${TARGET_CITIES.length} cities, max ${MAX_LEADS_PER_RUN} leads.`);

  const requestBody = {
    // Auth — some plans use the header; include both for compatibility
    api_key: apiKey,

    // Location: all Southwest Michigan cities at once
    person_locations: TARGET_CITIES,
    organization_locations: TARGET_CITIES,

    // Industry keywords
    q_organization_keyword_tags: TARGET_INDUSTRIES,

    // Title filter: only decision-makers
    person_titles: TARGET_TITLES,

    // Company size: 1–25 employees (owner-operated)
    organization_num_employees_ranges: [EMPLOYEE_RANGE],

    // Only return people who have a phone number
    contact_phone_exists: true,

    // Pagination
    page: 1,
    per_page: MAX_LEADS_PER_RUN,
  };

  let response;
  try {
    response = await axios.post(
      `${APOLLO_BASE_URL}/mixed_people/search`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
        timeout: 30000,
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message || err.message;
    throw new Error(`Apollo API request failed (HTTP ${status || 'timeout'}): ${detail}`);
  }

  const people = response.data?.people || [];
  if (people.length === 0) {
    console.log('[Apollo] No results returned from Apollo for the current filters.');
    return [];
  }

  console.log(`[Apollo] ${people.length} people returned from Apollo.`);

  // Map → filter out anyone without a phone number → sort by title priority
  const leads = people
    .map(mapPersonToLead)
    .filter(Boolean);

  const sorted = sortByTitlePriority(leads);

  console.log(`[Apollo] ${sorted.length} leads have a usable phone number.`);
  return sorted;
}

module.exports = { fetchLeads };
