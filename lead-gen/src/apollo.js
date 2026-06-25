// ─────────────────────────────────────────────────────────────────
// apollo.js — Apollo.io REST API integration.
//
// Docs: https://apolloio.github.io/apollo-api-docs/
// Endpoint used: POST /api/v1/mixed_people/search
//
// Phone number availability depends on your Apollo plan:
//   Free plan  → phone numbers often masked or unavailable
//   Basic+     → direct/mobile numbers available after "reveal"
//
// If you see leads with no phone, upgrade your Apollo plan or
// enable "phone unlock" credits in your Apollo account settings.
// ─────────────────────────────────────────────────────────────────

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

/**
 * Search Apollo for HVAC decision-makers in Southwest Michigan.
 *
 * @returns {Promise<Array<{businessName, firstName, lastName, phone, city, website}>>}
 *   Contacts that have at least one phone number. Empty array if none found.
 */
async function searchLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment variables');

  const payload = {
    api_key: apiKey,
    page: 1,
    // Fetch a larger batch so we still hit maxLeadsPerRun after duplicate filtering
    per_page: Math.min(100, config.maxLeadsPerRun * 4),

    // Strict title matching — don't expand to similar roles
    include_similar_titles: false,
    person_titles: config.jobTitles,

    // Target SW Michigan cities (matched against company HQ)
    organization_locations: config.cities,

    // 1–25 employees only
    organization_num_employees_ranges: config.employeeRanges,

    // Industry tags
    q_organization_keyword_tags: config.industryKeywords,
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    });
  } catch (err) {
    const status = err.response?.status ?? 'N/A';
    const detail = err.response?.data?.error ?? err.message;
    throw new Error(`Apollo API request failed (HTTP ${status}): ${detail}`);
  }

  const people = response.data?.people ?? [];
  if (people.length === 0) return [];

  const leads = people
    .map((person) => {
      const phone = pickBestPhone(person);
      if (!phone) return null; // skip contacts with no phone number

      return {
        businessName: (person.organization?.name ?? '').trim(),
        firstName:    (person.first_name ?? '').trim(),
        lastName:     (person.last_name ?? '').trim(),
        phone,
        city:         (person.city ?? person.organization?.city ?? '').trim(),
        website:      (person.organization?.website_url ?? '').trim(),
      };
    })
    .filter(Boolean); // remove null (no-phone) entries

  return leads;
}

/**
 * Extract the best available phone number from an Apollo person record.
 *
 * Priority order:
 *   1. direct_phone   — personal direct line (best for owner-operated businesses)
 *   2. mobile_phone   — personal mobile
 *   3. corporate_phone — business/office line (may go through a receptionist)
 *   4. other_phone    — any other number Apollo has on file
 *
 * Falls back to person.sanitized_phone when the phone_numbers array is empty
 * (some Apollo plans surface the number here instead).
 *
 * @param {object} person - Raw Apollo person object
 * @returns {string|null}
 */
function pickBestPhone(person) {
  const numbers = Array.isArray(person.phone_numbers) ? person.phone_numbers : [];

  const typePriority = ['direct_phone', 'mobile_phone', 'corporate_phone', 'other_phone'];
  for (const type of typePriority) {
    const entry = numbers.find((n) => n.type === type && n.raw_number);
    if (entry) return entry.raw_number;
  }

  // Any number, regardless of type
  const any = numbers.find((n) => n.raw_number);
  if (any) return any.raw_number;

  // Top-level fallback (seen on some plan tiers)
  return person.sanitized_phone ?? null;
}

module.exports = { searchLeads };
