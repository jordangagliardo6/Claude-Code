const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

const apolloClient = axios.create({
  baseURL: config.apollo.baseUrl,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': config.apollo.apiKey,
  },
  timeout: 30000,
});

/**
 * Builds the list of location strings Apollo uses for city-level filtering.
 * Combines each target city with the base state/country so Apollo can geo-match.
 */
function buildLocationFilters() {
  return config.cities.map((city) => `${city}, Michigan, United States`);
}

/**
 * Searches Apollo for HVAC/plumbing contacts matching our target criteria.
 * Returns an array of raw Apollo person records (may be empty).
 *
 * @param {number} page - 1-based page number (each page = up to maxLeadsPerRun results)
 */
async function searchLeads(page = 1) {
  const payload = {
    // Location: each city explicitly listed so Apollo biases results toward SW Michigan
    person_locations: buildLocationFilters(),

    // Decision-maker titles in priority order
    person_titles: config.jobTitles,

    // Industry keyword tags (Apollo matches any of these)
    q_organization_keyword_tags: config.industries,

    // Employee count — owner-operated small businesses only
    organization_num_employees_ranges: config.employeeRange,

    // Only return contacts that have at least one phone number
    contact_phone_number_status: ['verified', 'likely_to_engage'],

    // Pagination
    page,
    per_page: config.maxLeadsPerRun,
  };

  logger.info(`Searching Apollo — page ${page}, up to ${config.maxLeadsPerRun} results`);
  logger.info(`Cities: ${config.cities.join(', ')}`);

  const response = await apolloClient.post('/mixed_people/search', payload);
  const { people, pagination } = response.data;

  logger.info(
    `Apollo returned ${people ? people.length : 0} contacts ` +
    `(total available: ${pagination ? pagination.total_entries : 'unknown'})`
  );

  return people || [];
}

/**
 * Extracts and normalizes the fields we care about from a raw Apollo person record.
 * Returns null if the record is missing critical data (name or company).
 *
 * @param {Object} person - Raw Apollo person object
 */
function extractLead(person) {
  if (!person) return null;

  const org = person.organization || {};

  // Phone: prefer direct/mobile over work lines
  const phone = pickBestPhone(person.phone_numbers || []);

  // Skip contacts with no phone at all — they're not actionable
  if (!phone) return null;

  const bizName = org.name || person.employment_history?.[0]?.organization_name || null;
  if (!bizName) return null;

  // City: try person city first, fall back to org city
  const city =
    person.city ||
    person.contact_city ||
    org.city ||
    '';

  return {
    businessName: bizName.trim(),
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone,
    city,
    website: org.website_url ? normalizeUrl(org.website_url) : '',
  };
}

/**
 * Picks the best phone number from an array of Apollo phone objects.
 * Prefers mobile → direct → work, and skips numbers flagged as invalid.
 */
function pickBestPhone(phones) {
  const priority = ['mobile', 'direct', 'work', 'other'];

  for (const type of priority) {
    const match = phones.find(
      (p) => p.type === type && p.status !== 'invalid' && p.sanitized_number
    );
    if (match) return match.sanitized_number;
  }

  // Fall back to any number if none match priority types
  const fallback = phones.find((p) => p.status !== 'invalid' && p.sanitized_number);
  return fallback ? fallback.sanitized_number : null;
}

function normalizeUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://${url}`;
}

/**
 * Runs the full Apollo search and returns an array of clean lead objects.
 * Handles API errors gracefully and re-throws so the caller can alert.
 */
async function fetchLeads() {
  if (!config.apollo.apiKey) {
    throw new Error('APOLLO_API_KEY is not set. Check your .env file.');
  }

  let rawPeople;
  try {
    rawPeople = await searchLeads(1);
  } catch (err) {
    const msg = err.response
      ? `Apollo API error ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    throw new Error(`Apollo search failed — ${msg}`);
  }

  const leads = rawPeople
    .map(extractLead)
    .filter(Boolean); // drop nulls (no phone, no company, etc.)

  logger.info(`Extracted ${leads.length} usable leads after filtering`);
  return leads;
}

/**
 * Lightweight connectivity check — fetches the authenticated user profile.
 * Returns true on success, throws on failure.
 */
async function testConnection() {
  if (!config.apollo.apiKey) {
    throw new Error('APOLLO_API_KEY is not set. Check your .env file.');
  }

  const response = await apolloClient.get('/users/me');
  const user = response.data?.user;
  if (!user) throw new Error('Apollo returned an unexpected response from /users/me');

  logger.info(`Apollo connection OK — authenticated as: ${user.email}`);
  return true;
}

module.exports = { fetchLeads, testConnection };
