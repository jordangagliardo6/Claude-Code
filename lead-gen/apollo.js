/**
 * apollo.js — Apollo.io API client
 *
 * Searches for HVAC/mechanical company owners in Southwest Michigan.
 * Uses the /api/v1/mixed_people/api_search endpoint (requires paid Apollo plan).
 *
 * To change the cities or industries, edit SW_MICHIGAN_LOCATIONS and
 * KEYWORD_TAGS at the top of this file.
 */

'use strict';

const axios = require('axios');

// ─── Configuration ────────────────────────────────────────────────────────────

// Bias results toward these Southwest Michigan areas.
// Apollo matches these against organization city/region fields.
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
  'Southwest Michigan',
  'Berrien County, Michigan',
  'Allegan County, Michigan',
  'Ottawa County, Michigan',
  'Van Buren County, Michigan',
];

// Industry keyword tags Apollo uses to categorize companies.
const KEYWORD_TAGS = [
  'HVAC',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'air conditioning',
  'heating',
  'refrigeration',
];

// Decision-maker titles in priority order (Apollo searches all, we sort after).
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// NAICS codes for HVAC, plumbing, and mechanical contracting
// 2382 = Plumbing, Heating, and Air-Conditioning Contractors
// 2381 = Foundation, Structure, and Building Exterior Contractors (includes mechanical)
const NAICS_CODES = ['2382'];

const APOLLO_BASE_URL = 'https://api.apollo.io';

// ─── Title priority helper ────────────────────────────────────────────────────

function titlePriority(title) {
  if (!title) return 99;
  const t = title.toLowerCase();
  if (t === 'owner') return 0;
  if (t === 'president') return 1;
  if (t.includes('founder')) return 2;      // founder or co-founder
  if (t.includes('co-founder')) return 2;
  if (t === 'general manager') return 3;
  return 4;
}

// ─── Phone extraction helper ──────────────────────────────────────────────────

function extractPhone(person) {
  // Apollo returns phone_numbers as an array of {raw_number, sanitized_number, type, ...}
  const phones = person.phone_numbers || [];

  // Prefer mobile, then direct, then any
  const mobile = phones.find((p) => p.type === 'mobile');
  if (mobile) return mobile.sanitized_number || mobile.raw_number;

  const direct = phones.find((p) => p.type === 'direct');
  if (direct) return direct.sanitized_number || direct.raw_number;

  if (phones.length > 0) return phones[0].sanitized_number || phones[0].raw_number;

  // Fallback to top-level fields some plan tiers expose directly
  return person.mobile_phone || person.direct_phone || null;
}

// ─── Main search function ─────────────────────────────────────────────────────

/**
 * Fetch up to `limit` leads from Apollo.
 *
 * @param {string} apiKey  - APOLLO_API_KEY
 * @param {number} limit   - max results to return (default 25)
 * @returns {Array} normalized lead objects
 */
async function searchLeads(apiKey, limit = 25) {
  const headers = {
    'x-api-key': apiKey,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  };

  // We request more than `limit` from Apollo so we can filter by phone after.
  // Apollo's API caps per_page at 100.
  const perPage = Math.min(100, limit * 3);

  const body = {
    // Location: bias toward Southwest Michigan at both the organization and person level
    organization_locations: SW_MICHIGAN_LOCATIONS,

    // Industry filters
    q_organization_keyword_tags: KEYWORD_TAGS,
    organization_naics_codes: NAICS_CODES,

    // Company size: 1–25 employees (owner-operated small businesses)
    organization_num_employees_ranges: ['1,10', '11,25'],

    // Decision-maker seniority
    person_seniorities: ['owner', 'founder', 'c_suite'],

    // Target titles
    person_titles: TARGET_TITLES,

    // Include similar titles (e.g., "co-owner", "managing partner")
    include_similar_titles: true,

    page: 1,
    per_page: perPage,
  };

  let response;
  try {
    response = await axios.post(
      `${APOLLO_BASE_URL}/api/v1/mixed_people/api_search`,
      body,
      { headers, timeout: 30000 }
    );
  } catch (err) {
    // Surface the Apollo error message clearly
    const apolloMsg = err.response?.data?.error || err.response?.data?.message;
    throw new Error(
      apolloMsg
        ? `Apollo API error: ${apolloMsg}`
        : `Apollo request failed: ${err.message}`
    );
  }

  const people = response.data?.people || [];

  // Filter out anyone without a phone number (per requirements)
  const withPhone = people.filter((p) => extractPhone(p) !== null);

  // Sort by title priority so Owners come before General Managers, etc.
  withPhone.sort((a, b) => titlePriority(a.title) - titlePriority(b.title));

  // Normalize to the shape the sheets module expects
  return withPhone.slice(0, limit).map((p) => ({
    businessName: p.organization_name || p.employment_history?.[0]?.organization_name || '',
    firstName: p.first_name || '',
    lastName: p.last_name || '',
    phone: extractPhone(p),
    city: p.city || p.organization_city || '',
    website: p.organization_website_url || p.website_url || '',
  }));
}

module.exports = { searchLeads };
