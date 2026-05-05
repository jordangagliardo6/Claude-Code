'use strict';

/**
 * Apollo.io People Search
 *
 * Searches for decision-makers at HVAC / plumbing / mechanical companies
 * in Southwest Michigan using the Apollo.io v1 mixed_people/search API.
 *
 * Apollo API docs: https://apolloio.github.io/apollo-api-docs/
 *
 * ENV required:
 *   APOLLO_API_KEY – your Apollo.io API key
 */

require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// ─── Configurable target cities ───────────────────────────────────────────────
// Edit this list freely to add or remove Southwest Michigan cities.
const TARGET_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// ─── Configurable industry keywords ───────────────────────────────────────────
// Apollo matches these against company keyword tags. Edit freely.
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
];

// ─── Configurable job titles (priority order) ─────────────────────────────────
// Apollo returns results that match any of these titles. We re-rank by priority
// during result processing in workflow.js.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Apollo employee-range strings that cover 1–25 employees.
// Apollo uses predefined buckets; "1,10" and "11,20" keep us tightly inside the
// 1–25 window. Add "21,50" if you want to cast a wider net.
const EMPLOYEE_RANGES = ['1,10', '11,20'];

/**
 * Fetch up to `limit` leads from Apollo.io.
 *
 * @param {number} limit   Maximum contacts to return (default 25).
 * @param {number} page    Page number for pagination (1-based, default 1).
 * @returns {Promise<ApolloContact[]>} Normalised contact objects.
 */
async function searchLeads(limit = 25, page = 1) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY environment variable is not set.');
  }

  const payload = {
    // Titles
    person_titles: TARGET_TITLES,

    // Locations – pass all cities so Apollo fans out the search
    person_locations: TARGET_LOCATIONS,

    // Company size
    organization_num_employees_ranges: EMPLOYEE_RANGES,

    // Industry – keyword tags on the company record
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,

    // Pagination
    page,
    per_page: Math.min(limit, 25), // Apollo caps per_page at 25

    // Only return contacts who have at least one phone number revealed.
    // NOTE: Apollo may not honour this filter on all plan tiers.
    // We apply a secondary JavaScript filter below as a safety net.
    contact_phone_status: 'verified',
  };

  logger.info(`Querying Apollo (page ${page}, limit ${limit})…`);

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE_URL}/mixed_people/search`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error ?? err.message;

    if (status === 401 || status === 403) {
      throw new Error(`Apollo authentication failed (${status}). Check APOLLO_API_KEY.`);
    }
    if (status === 429) {
      throw new Error('Apollo rate limit hit. Try again in a few minutes.');
    }
    throw new Error(`Apollo API request failed (${status ?? 'network error'}): ${detail}`);
  }

  const raw = response.data?.people ?? response.data?.contacts ?? [];
  logger.info(`Apollo returned ${raw.length} raw record(s).`);

  const contacts = raw
    .map(normaliseContact)
    .filter(hasPhone); // hard filter — drop any record without a phone number

  logger.info(`${contacts.length} contact(s) have a phone number after filtering.`);
  return contacts;
}

/**
 * Map a raw Apollo contact record to the shape the rest of the app expects.
 * @param {object} person  Raw Apollo contact object
 * @returns {ApolloContact}
 */
function normaliseContact(person) {
  const org = person.organization ?? person.account ?? {};

  // Apollo can store the website on the org or on the person record
  const website =
    org.website_url ??
    org.primary_domain ??
    person.website_url ??
    '';

  // Phone: prefer direct/mobile, fall back to any number in phone_numbers[]
  const phone =
    person.mobile_phone ??
    person.direct_dial_phone ??
    (person.phone_numbers ?? [])[0]?.sanitized_number ??
    (person.phone_numbers ?? [])[0]?.raw_number ??
    '';

  return {
    firstName:   person.first_name  ?? '',
    lastName:    person.last_name   ?? '',
    title:       person.title       ?? '',
    companyName: org.name           ?? person.organization_name ?? '',
    phone:       phone,
    city:        person.city        ?? org.city ?? '',
    website:     cleanWebsite(website),
  };
}

/** Return true when the contact has a non-empty phone number. */
function hasPhone(contact) {
  return contact.phone.trim().length > 0;
}

/** Strip protocol prefix so the spreadsheet column stays clean and readable. */
function cleanWebsite(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/**
 * Simple connectivity check — verifies the API key works without consuming
 * search credits. Returns true on success, throws on failure.
 */
async function testConnection() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set.');

  await axios.get(`${APOLLO_BASE_URL}/auth/health`, {
    headers: { 'x-api-key': apiKey },
    timeout: 10_000,
  });

  return true;
}

module.exports = { searchLeads, testConnection, TARGET_LOCATIONS, TARGET_TITLES, INDUSTRY_KEYWORDS };

/**
 * @typedef {object} ApolloContact
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} title
 * @property {string} companyName
 * @property {string} phone
 * @property {string} city
 * @property {string} website
 */
