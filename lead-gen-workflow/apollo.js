/**
 * apollo.js — Apollo.io People Search client
 *
 * Uses the Apollo v1 mixed_people/search endpoint to find HVAC business
 * owners in Southwest Michigan. Normalises each result into a flat lead
 * object that maps directly onto the spreadsheet columns.
 *
 * Apollo API docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios  = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io';

// ── INDUSTRY MAPPING ──────────────────────────────────────────────────────
// Apollo uses numeric industry tag IDs internally.  The IDs below cover the
// most common HVAC / mechanical / plumbing categories.  If results look off,
// open Apollo in your browser → Search People → Filters → Industry → select
// your target industries → open DevTools Network tab → look for
// "organization_industry_tag_ids" in the request body to get the exact IDs
// for your Apollo account.
//
// Common IDs (verify in your own account):
//   5567cd4773696439b10b0000 — Facilities Services
//   5567cd4773696439b10b0001 — Construction
//   5567cd4e7369643cc1040000 — Mechanical or Industrial Engineering
//
// This script falls back to keyword-based filtering when no IDs are set.
const INDUSTRY_TAG_IDS = [];  // ← paste your IDs here if you have them

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the array of "City, State, Country" location strings for Apollo.
 */
function buildLocationFilters() {
  return config.CITIES.map(
    city => `${city}, ${config.STATE}, ${config.COUNTRY}`
  );
}

/**
 * Search Apollo for HVAC decision-makers in Southwest Michigan.
 *
 * @param {number} page  - Apollo page number (1-indexed).
 * @returns {Promise<Array>} - Array of normalised lead objects.
 */
async function searchLeads(page = 1) {
  const locations = buildLocationFilters();

  // Build the keyword string that Apollo searches across org name/description.
  const keywordQuery = config.INDUSTRY_KEYWORDS.join(' OR ');

  const payload = {
    per_page:                         config.MAX_LEADS_PER_RUN,
    page,
    // Decision-maker titles in priority order
    person_titles:                    config.TARGET_TITLES,
    // Southwest Michigan cities
    person_locations:                 locations,
    // Small/owner-operated businesses only
    organization_num_employees_ranges: [config.EMPLOYEE_RANGE],
    // Keyword bias toward HVAC industry (best-effort; not guaranteed exact)
    q_keywords:                       keywordQuery,
    // Include organisation details in the response
    include_account:                  true,
  };

  // Add numeric industry tag IDs if configured above
  if (INDUSTRY_TAG_IDS.length) {
    payload.organization_industry_tag_ids = INDUSTRY_TAG_IDS;
  }

  let response;
  try {
    response = await axios.post(
      `${APOLLO_BASE}/v1/mixed_people/search`,
      payload,
      {
        headers: {
          'Content-Type':  'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key':     config.APOLLO_API_KEY,
        },
        timeout: 30_000,
      }
    );
  } catch (err) {
    const status  = err.response?.status;
    const message = err.response?.data?.message || err.message;
    throw new Error(`Apollo API error (HTTP ${status}): ${message}`);
  }

  const people = response.data?.people || [];
  console.log(`[Apollo] Page ${page}: ${people.length} result(s) returned.`);

  // Normalise and drop anyone with no phone number
  return people
    .map(normalisePerson)
    .filter(lead => Boolean(lead.phone));
}

/**
 * Flatten a raw Apollo person record into the columns we care about.
 *
 * @param  {Object} person - Raw Apollo person object.
 * @returns {Object} - Normalised lead.
 */
function normalisePerson(person) {
  const org = person.organization || person.account || {};

  const phone   = pickBestPhone(person.phone_numbers || []);
  const website = pickWebsite(org);

  // Prefer the person's own city; fall back to the org address
  const city =
    person.city ||
    (org.raw_address || '').split(',')[0]?.trim() ||
    '';

  return {
    businessName: (org.name || '').trim(),
    firstName:    (person.first_name || '').trim(),
    lastName:     (person.last_name  || '').trim(),
    phone,
    city,
    website,
    title:        (person.title || '').trim(), // kept for logging, not written to sheet
  };
}

/**
 * Pick the best available phone number from Apollo's phone_numbers array.
 * Priority: mobile > direct > corporate > any.
 *
 * @param  {Array}  phoneNumbers - Apollo phone_numbers array.
 * @returns {string} - Raw phone number string, or empty string.
 */
function pickBestPhone(phoneNumbers) {
  if (!phoneNumbers.length) return '';

  const priority = ['mobile', 'direct', 'corporate', 'other'];

  for (const type of priority) {
    const match = phoneNumbers.find(p => p.type === type);
    if (match) return match.sanitized_number || match.raw_number || '';
  }

  // No type match — return whatever we have
  const first = phoneNumbers[0];
  return first.sanitized_number || first.raw_number || '';
}

/**
 * Derive a website URL from an Apollo organisation object.
 *
 * @param  {Object} org - Apollo organisation / account object.
 * @returns {string} - URL string or empty string.
 */
function pickWebsite(org) {
  if (org.website_url)  return org.website_url;
  if (org.primary_domain) return `https://${org.primary_domain}`;
  return '';
}

module.exports = { searchLeads };
