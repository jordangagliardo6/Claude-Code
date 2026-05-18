'use strict';

const axios  = require('axios');
const config = require('./config');
const logger = require('./logger');

const BASE_URL = 'https://api.apollo.io/api/v1';

// ─── Phone helpers ────────────────────────────────────────────────────────────

// Returns the best available phone number, preferring mobile > direct > HQ.
function pickBestPhone(phoneNumbers) {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) return null;
  const priority = ['mobile', 'work_direct', 'work_hq'];
  for (const type of priority) {
    const match = phoneNumbers.find((p) => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  // Fall back to whatever is first
  return phoneNumbers[0]?.sanitized_number || phoneNumbers[0]?.raw_number || null;
}

// ─── Title priority helper ────────────────────────────────────────────────────

// Lower index = higher priority. Returns Infinity if the title isn't in the list.
function titlePriority(title) {
  if (!title) return Infinity;
  const normalized = title.toLowerCase();
  return config.JOB_TITLES.findIndex((t) => normalized.includes(t.toLowerCase()));
}

// ─── Response parser ──────────────────────────────────────────────────────────

// Converts a raw Apollo person object into the shape the rest of the app uses.
function parsePerson(person) {
  const org   = person.organization || {};
  const phone = pickBestPhone(person.phone_numbers);
  if (!phone) return null; // skip contacts with no phone at all

  return {
    businessName: (org.name || person.organization_name || '').trim(),
    firstName:    (person.first_name || '').trim(),
    lastName:     (person.last_name  || '').trim(),
    title:        (person.title      || '').trim(),
    phone,
    city:         (person.city || org.city || '').trim(),
    website:      (org.website_url   || '').trim(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Verifies the API key is valid by doing a minimal 1-result search.
async function testConnection() {
  const resp = await axios.post(
    `${BASE_URL}/mixed_people/search`,
    { api_key: process.env.APOLLO_API_KEY, page: 1, per_page: 1 },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  return resp.status === 200 && Array.isArray(resp.data?.people);
}

/**
 * Searches Apollo for HVAC decision-makers in Southwest Michigan.
 *
 * Apollo searches across ALL target cities in one request because
 * person_locations accepts an array. We then pick the best-titled
 * contact per company on the client side.
 *
 * @param {number} page  - 1-based page number
 * @returns {{ leads: Array, totalEntries: number }}
 */
async function searchLeads(page = 1) {
  const body = {
    api_key:    process.env.APOLLO_API_KEY,
    page,
    per_page:   config.APOLLO_PER_PAGE,

    // Decision-maker titles (Apollo filters server-side)
    person_titles: config.JOB_TITLES,

    // Southwest Michigan cities — Apollo accepts an array
    person_locations: config.TARGET_LOCATIONS,

    // Owner-operated small businesses only
    organization_num_employees_ranges: config.EMPLOYEE_RANGES,

    // HVAC / trades industry keyword filter
    q_keywords: config.INDUSTRY_KEYWORDS,

    // Include numeric industry tag IDs if configured in config.js
    ...(config.INDUSTRY_TAG_IDS.length > 0 && {
      organization_industry_tag_ids: config.INDUSTRY_TAG_IDS,
    }),

    // Ask Apollo to reveal phone numbers (requires a plan that supports this)
    reveal_personal_emails: false,
    // Note: phone reveal may use credits depending on your Apollo plan
  };

  const resp = await axios.post(`${BASE_URL}/mixed_people/search`, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const people    = resp.data?.people          || [];
  const totalEntries = resp.data?.pagination?.total_entries || 0;

  // Parse and drop contacts without phone numbers
  const rawLeads = people
    .map(parsePerson)
    .filter(Boolean)
    .filter((l) => l.businessName); // must have a company name

  // When a company appears multiple times, keep only the highest-priority title
  const bestPerCompany = new Map();
  for (const lead of rawLeads) {
    const key = lead.businessName.toLowerCase();
    const existing = bestPerCompany.get(key);
    if (!existing || titlePriority(lead.title) < titlePriority(existing.title)) {
      bestPerCompany.set(key, lead);
    }
  }

  return {
    leads: Array.from(bestPerCompany.values()),
    totalEntries,
  };
}

/**
 * Fetches leads across multiple Apollo pages until maxNeeded unique leads
 * (after external duplicate filtering) are collected, or pages run out.
 *
 * @param {number} maxNeeded   - stop once we have this many leads
 * @param {Set}    knownNames  - business names already in the sheet (lowercase)
 * @returns {Array}
 */
async function fetchNewLeads(maxNeeded, knownNames) {
  const collected = [];
  let page = 1;
  let totalEntries = Infinity;

  while (collected.length < maxNeeded && (page - 1) * config.APOLLO_PER_PAGE < totalEntries) {
    logger.info(`Apollo: fetching page ${page}…`);
    const result = await searchLeads(page);
    totalEntries = result.totalEntries;

    for (const lead of result.leads) {
      if (collected.length >= maxNeeded) break;
      if (!knownNames.has(lead.businessName.toLowerCase())) {
        collected.push(lead);
        knownNames.add(lead.businessName.toLowerCase()); // prevent within-run duplicates
      }
    }

    if (result.leads.length === 0) break; // no more results on this page
    page++;
  }

  logger.info(`Apollo: collected ${collected.length} new lead(s) from ${page - 1} page(s). Apollo total: ${totalEntries}`);
  return collected;
}

module.exports = { testConnection, searchLeads, fetchNewLeads };
