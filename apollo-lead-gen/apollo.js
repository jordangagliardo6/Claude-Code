/**
 * apollo.js — Apollo.io API integration.
 *
 * Searches for HVAC decision-makers in Southwest Michigan using the
 * Apollo People Search endpoint, then filters client-side to the
 * target city list and deduplicates by job-title priority.
 */

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

/**
 * Fetch up to `limit` qualified leads from Apollo.
 * Returns an array of normalised lead objects ready for the sheet.
 *
 * @param {number} limit  Maximum leads to return (default: MAX_LEADS_PER_RUN)
 * @returns {Promise<Array>}
 */
async function fetchLeads(limit = config.MAX_LEADS_PER_RUN) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  // Apollo returns pages of 25. We may need multiple pages to hit `limit`.
  const pageSize = Math.min(25, limit);
  const leads = [];
  let page = 1;

  while (leads.length < limit) {
    const results = await searchPage(apiKey, page, pageSize);
    if (!results || results.length === 0) break;

    for (const person of results) {
      if (leads.length >= limit) break;

      const lead = normalizePerson(person);
      if (lead) leads.push(lead);
    }

    page += 1;

    // Apollo caps people search at 10 pages without paying for more credits.
    if (page > 10) break;
  }

  return leads;
}

/**
 * Calls Apollo /mixed_people/search for a single page and returns raw people.
 */
async function searchPage(apiKey, page, perPage) {
  const payload = {
    api_key: apiKey,

    // Free-text keyword covering HVAC / plumbing industries.
    q_keywords: config.INDUSTRY_KEYWORDS,

    // Job titles in priority order.
    person_titles: config.JOB_TITLES,

    // Restrict to Michigan contacts.
    person_locations: [config.APOLLO_LOCATION],

    // Company employee range (owner-operated: 1–25).
    organization_num_employees_ranges: config.EMPLOYEE_RANGE,

    // Only return people who have at least one phone number on record.
    contact_phone_status: ['likely_to_connect', 'always_on'],

    // Pagination.
    page,
    per_page: perPage,
  };

  try {
    const response = await axios.post(
      `${APOLLO_BASE}/mixed_people/search`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 30_000,
      }
    );

    return response.data?.people ?? [];
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.message ?? err.message;

    if (status === 422) {
      // Apollo returns 422 when credits are exhausted or the query is invalid.
      throw new Error(`Apollo rejected the search (422): ${detail}`);
    }
    if (status === 401 || status === 403) {
      throw new Error(`Apollo auth failed (${status}). Check APOLLO_API_KEY.`);
    }
    throw new Error(`Apollo search error (${status ?? 'network'}): ${detail}`);
  }
}

/**
 * Convert a raw Apollo person object into a flat lead record.
 * Returns null when the person should be skipped (no phone, wrong city, etc.).
 */
function normalizePerson(person) {
  // ── Phone number ─────────────────────────────────────────────────────────────
  // Prefer direct/mobile numbers over general company lines.
  const phone = pickPhone(person);
  if (!phone) return null;  // skip contacts with no usable phone

  // ── City filtering ────────────────────────────────────────────────────────────
  const city = extractCity(person);
  if (!matchesTargetCity(city)) return null;

  // ── Build the lead record ─────────────────────────────────────────────────────
  return {
    businessName: person.organization?.name ?? person.employment_history?.[0]?.organization_name ?? '',
    firstName: person.first_name ?? '',
    lastName: person.last_name ?? '',
    phone,
    city,
    website: extractWebsite(person),
  };
}

/**
 * Returns the best available phone number from an Apollo person object.
 * Priority: direct → mobile → phone_numbers array → sanitized_phone.
 */
function pickPhone(person) {
  if (person.direct_dial_number) return formatPhone(person.direct_dial_number);
  if (person.mobile_phone) return formatPhone(person.mobile_phone);

  const nums = person.phone_numbers ?? [];
  for (const entry of nums) {
    if (entry.status === 'likely_to_connect' || entry.type === 'direct_phone') {
      return formatPhone(entry.sanitized_number ?? entry.raw_number);
    }
  }
  for (const entry of nums) {
    const num = entry.sanitized_number ?? entry.raw_number;
    if (num) return formatPhone(num);
  }

  return formatPhone(person.sanitized_phone) || null;
}

/** Strip non-digits, reformat as (XXX) XXX-XXXX for US numbers. */
function formatPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  // Handle 11-digit numbers starting with country code 1.
  const local = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (local.length !== 10) return null;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/**
 * Pull city from the person's work location or their organization's HQ.
 */
function extractCity(person) {
  return (
    person.city ||
    person.organization?.city ||
    person.employment_history?.[0]?.city ||
    ''
  );
}

/**
 * Returns true if the given city string matches any of the target cities
 * (case-insensitive, partial-match tolerant).
 */
function matchesTargetCity(city) {
  if (!city) return false;
  const lower = city.toLowerCase();
  return config.TARGET_CITIES.some((t) => lower.includes(t.toLowerCase()));
}

/**
 * Extract the company website, preferring the Apollo organization record.
 */
function extractWebsite(person) {
  const url =
    person.organization?.website_url ||
    person.organization?.primary_domain ||
    '';
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

module.exports = { fetchLeads };
