/**
 * Apollo.io search module
 *
 * Uses the Apollo People Search API to find owner-operated HVAC/Plumbing
 * companies in Southwest Michigan with verified phone numbers.
 *
 * API docs: https://apolloio.github.io/apollo-api-docs/#mixed-people-search
 */

require('dotenv').config();
const axios = require('axios');
const config = require('./config');
const log = require('./logger');

const APOLLO_BASE = 'https://api.apollo.io/v1';

/**
 * Fetch up to `limit` unique leads across all target cities.
 * Returns an array of normalized lead objects ready to write to Sheets.
 */
async function searchLeads(limit = config.MAX_LEADS) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment variables.');

  log.info(`Starting Apollo search — limit: ${limit} leads`);

  const leads = [];
  const seenOrgIds = new Set();

  // Rotate through cities so we get geographic spread within a single run
  for (const city of config.TARGET_CITIES) {
    if (leads.length >= limit) break;

    const remaining = limit - leads.length;
    log.info(`Searching city: ${city} (${remaining} slots remaining)`);

    const cityLeads = await searchCity(apiKey, city, remaining, seenOrgIds);
    leads.push(...cityLeads);
    log.info(`  → Found ${cityLeads.length} leads in ${city}`);
  }

  // If we still need more leads, do a broader Michigan search as a fallback
  if (leads.length < limit) {
    log.info(`Broadening search to all of Michigan for remaining ${limit - leads.length} slots`);
    const fallback = await searchCity(apiKey, 'Michigan, United States', limit - leads.length, seenOrgIds);
    leads.push(...fallback);
    log.info(`  → Fallback found ${fallback.length} additional leads`);
  }

  log.info(`Apollo search complete — ${leads.length} total leads retrieved`);
  return leads;
}

/**
 * Search Apollo for a single city/location, returning normalized lead objects.
 * `seenOrgIds` is mutated to track duplicates across city iterations.
 */
async function searchCity(apiKey, location, limit, seenOrgIds) {
  const payload = {
    api_key: apiKey,
    // Location filter — Apollo accepts "City, State" or "State, Country" strings
    person_locations: [location],
    // Job title filter — Apollo uses fuzzy matching on these strings
    person_titles: config.TARGET_TITLES,
    // Company employee count range
    organization_num_employees_ranges: [config.EMPLOYEE_RANGE],
    // Industry keyword filter
    q_organization_keyword_tags: config.INDUSTRY_KEYWORDS,
    // Only return contacts that have at least one phone number
    contact_phone_status: 'verified',
    page: 1,
    per_page: Math.min(limit, 25), // Apollo max per page is 25
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30000,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    log.error(`Apollo API error for "${location}": HTTP ${status} — ${detail}`);
    // Return empty rather than crashing the whole run
    return [];
  }

  const people = response.data?.people || [];
  if (people.length === 0) {
    log.warn(`Apollo returned 0 results for "${location}"`);
    return [];
  }

  const leads = [];
  for (const person of people) {
    // Skip if we already captured someone from this company
    const orgId = person.organization_id || person.organization?.id;
    if (orgId && seenOrgIds.has(orgId)) continue;

    // Skip if no usable phone number
    const phone = extractPhone(person);
    if (!phone) continue;

    if (orgId) seenOrgIds.add(orgId);

    leads.push(normalizeLead(person, phone, location));
    if (leads.length >= limit) break;
  }

  return leads;
}

/**
 * Pick the best available phone number in priority order:
 * direct > mobile > work > first available
 */
function extractPhone(person) {
  // Apollo returns phone data in phone_numbers array and top-level fields
  const phones = person.phone_numbers || [];

  const direct = phones.find((p) => p.type === 'direct_phone');
  if (direct?.sanitized_number) return direct.sanitized_number;

  const mobile = phones.find((p) => p.type === 'mobile_phone');
  if (mobile?.sanitized_number) return mobile.sanitized_number;

  const work = phones.find((p) => p.type === 'work_phone');
  if (work?.sanitized_number) return work.sanitized_number;

  // Fall back to any number present
  const any = phones.find((p) => p.sanitized_number);
  if (any?.sanitized_number) return any.sanitized_number;

  // Some Apollo responses put mobile directly on the contact object
  return person.mobile_phone || person.direct_phone || null;
}

/**
 * Map an Apollo person record into the flat object our Sheets writer expects.
 */
function normalizeLead(person, phone, sourceLocation) {
  const org = person.organization || {};

  // Derive city: prefer the person's city, fall back to org city, then source
  const city =
    person.city ||
    org.city ||
    extractCityFromLocation(sourceLocation);

  const website = sanitizeUrl(org.website_url || person.website_url);

  return {
    businessName: org.name || person.organization_name || '',
    firstName:    person.first_name || '',
    lastName:     person.last_name || '',
    phone,
    city,
    website,
  };
}

function extractCityFromLocation(location) {
  // "St. Joseph, Michigan" → "St. Joseph"
  return location.split(',')[0].trim();
}

function sanitizeUrl(url) {
  if (!url) return '';
  // Strip tracking params and ensure it starts with http
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.origin; // e.g. "https://example.com"
  } catch {
    return url;
  }
}

module.exports = { searchLeads };
