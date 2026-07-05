/**
 * apollo.js — Apollo.io API integration.
 *
 * Uses the People Search endpoint to find owner/decision-maker contacts at
 * small HVAC and plumbing companies in Southwest Michigan.
 *
 * Apollo API docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/v1';

/**
 * Search Apollo for people matching our HVAC / SW Michigan criteria.
 * Returns the raw API response object.
 *
 * @param {number} page - 1-indexed page number
 * @returns {Promise<Object>} Raw Apollo response with `people` and `pagination`
 */
async function searchHVACLeads(page = 1) {
  const payload = {
    api_key: process.env.APOLLO_API_KEY,

    // Industry / company type filters
    q_organization_keyword_tags: config.industries,

    // Decision-maker title filter
    person_titles: config.jobTitlePriority,

    // Location — state-level + specific cities
    person_locations: config.apolloLocations,

    // Company size: 1–25 employees (owner-operated)
    organization_num_employees_ranges: config.employeeRanges,

    // Pagination
    page,
    per_page: 25,
  };

  const response = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 15000,
    }
  );

  return response.data;
}

/**
 * Convert a raw Apollo person object into our internal lead format.
 * Returns null if the contact has no usable phone number (we always skip those).
 *
 * @param {Object} person - Raw Apollo person record
 * @returns {Object|null} Normalized lead, or null if no phone
 */
function mapToLead(person) {
  const org = person.organization || {};

  // ── Phone selection ────────────────────────────────────────────────────
  // Prefer mobile > direct > work > other.
  const phone = pickBestPhone(person.phone_numbers);
  if (!phone) return null;

  // ── City ───────────────────────────────────────────────────────────────
  // Apollo may populate city on the person or on the org.
  const city = person.city || org.city || '';

  // ── Website ────────────────────────────────────────────────────────────
  let website = org.website_url || '';
  if (!website && org.primary_domain) {
    website = `https://${org.primary_domain}`;
  }

  return {
    businessName: (org.name || '').trim(),
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone: formatPhone(phone),
    city: city.trim(),
    website: website.trim(),
    // Preserve raw title so we can sort by priority later
    _title: (person.title || '').trim(),
  };
}

/**
 * Pick the best phone number from Apollo's phone_numbers array.
 * Priority: mobile → direct → work → any available.
 *
 * @param {Array} phoneNumbers - Apollo phone_numbers array
 * @returns {string|null}
 */
function pickBestPhone(phoneNumbers) {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) return null;

  const priority = { mobile: 0, direct: 1, work: 2, other: 3 };
  const sorted = [...phoneNumbers].sort(
    (a, b) => (priority[a.type] ?? 3) - (priority[b.type] ?? 3)
  );

  const best = sorted[0];
  return best.sanitized_number || best.raw_number || best.number || null;
}

/**
 * Format a raw phone string as (XXX) XXX-XXXX for US numbers.
 * Returns the original string if it doesn't match a 10 or 11-digit US number.
 *
 * @param {string} raw
 * @returns {string}
 */
function formatPhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('1')) {
    const n = digits.slice(1);
    return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

/**
 * Re-sort leads so that higher-priority job titles appear first.
 * Titles not in the config priority list are pushed to the end.
 *
 * @param {Array} leads
 * @returns {Array}
 */
function sortByTitlePriority(leads) {
  const titleIndex = (title) => {
    const t = (title || '').toLowerCase();
    const idx = config.jobTitlePriority.findIndex((p) =>
      t.includes(p.toLowerCase())
    );
    return idx === -1 ? 999 : idx;
  };

  return [...leads].sort(
    (a, b) => titleIndex(a._title) - titleIndex(b._title)
  );
}

module.exports = { searchHVACLeads, mapToLead, sortByTitlePriority };
