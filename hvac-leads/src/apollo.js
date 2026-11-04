'use strict';

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// Title priority lookup — lower index = higher priority.
const TITLE_PRIORITY = config.TARGET_TITLES.reduce((acc, t, i) => {
  acc[t.toLowerCase()] = i;
  return acc;
}, {});

/**
 * Returns the priority score for a contact's title (lower = better).
 * Falls back to a high number so untargeted titles sort last.
 */
function titlePriority(title = '') {
  const lower = title.toLowerCase();
  for (const [key, rank] of Object.entries(TITLE_PRIORITY)) {
    if (lower.includes(key)) return rank;
  }
  return 999;
}

/**
 * Extract the best phone number from an Apollo person record.
 * Prefers mobile over direct over any other type.
 */
function bestPhone(person) {
  const numbers = person.phone_numbers || [];

  const mobile = numbers.find((p) =>
    (p.sanitized_number || p.raw_number) &&
    p.type && p.type.toLowerCase().includes('mobile')
  );
  if (mobile) return mobile.sanitized_number || mobile.raw_number;

  const direct = numbers.find((p) =>
    (p.sanitized_number || p.raw_number) &&
    p.type && p.type.toLowerCase().includes('direct')
  );
  if (direct) return direct.sanitized_number || direct.raw_number;

  const any = numbers.find((p) => p.sanitized_number || p.raw_number);
  if (any) return any.sanitized_number || any.raw_number;

  // Fall back to the top-level mobile_phone field if present
  return person.mobile_phone || null;
}

/**
 * Search Apollo.io for HVAC decision-makers in Southwest Michigan.
 *
 * @param {number} maxResults  Maximum leads to return (after dedup within this batch)
 * @returns {Promise<Array>}   Array of normalized lead objects
 */
async function searchLeads(maxResults = 25) {
  const apiKey = config.APOLLO_API_KEY();

  // Apollo people/search accepts up to 100 per page; we fetch one page and trim.
  const perPage = Math.min(maxResults * 3, 100); // over-fetch to account for contacts without phones

  const payload = {
    api_key: apiKey,
    // Keyword filter: target the HVAC/plumbing/mechanical industries
    q_keywords: config.APOLLO_INDUSTRIES.join(' OR '),
    // Decision-maker titles
    person_titles: config.TARGET_TITLES,
    // Broad state-level location (Apollo's geo granularity for people search)
    person_locations: [config.APOLLO_LOCATION],
    // 1–25 employees
    organization_num_employees_ranges: [config.EMPLOYEE_RANGE],
    // Request phone numbers in the response
    contact_phone_numbers: true,
    page: 1,
    per_page: perPage,
  };

  let raw;
  try {
    const response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    });
    raw = response.data;
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    throw new Error(`Apollo API request failed (HTTP ${status || 'network'}): ${detail}`);
  }

  const people = raw.people || raw.contacts || [];
  if (!people.length) return [];

  // ── Normalize ────────────────────────────────────────────────────────────
  const normalized = people
    .map((person) => {
      const phone = bestPhone(person);
      if (!phone) return null; // skip contacts with no phone

      const org = person.organization || {};
      const city =
        person.city ||
        (person.employment_history?.[0]?.organization_city) ||
        org.city ||
        '';

      return {
        businessName: org.name || person.organization_name || '',
        firstName: person.first_name || '',
        lastName: person.last_name || '',
        phone,
        city,
        website: org.website_url || org.primary_domain || '',
        titleRank: titlePriority(person.title),
      };
    })
    .filter(Boolean); // drop nulls (no phone)

  // ── De-dup within this batch by business name ────────────────────────────
  // When multiple contacts match for the same company, keep the highest-priority title.
  const seen = new Map();
  for (const lead of normalized) {
    const key = lead.businessName.toLowerCase().trim();
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing || lead.titleRank < existing.titleRank) {
      seen.set(key, lead);
    }
  }

  return Array.from(seen.values()).slice(0, maxResults);
}

/**
 * Lightweight connectivity check — verifies the API key returns a 200.
 */
async function testConnection() {
  const apiKey = config.APOLLO_API_KEY();
  try {
    const response = await axios.post(
      `${APOLLO_BASE}/mixed_people/search`,
      { api_key: apiKey, q_keywords: 'hvac', page: 1, per_page: 1 },
      {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 15_000,
      }
    );
    const count = (response.data.people || response.data.contacts || []).length;
    return { ok: true, message: `Apollo API connected. Test query returned ${count} result(s).` };
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    return { ok: false, message: `Apollo connection failed (HTTP ${status || 'network'}): ${detail}` };
  }
}

module.exports = { searchLeads, testConnection };
