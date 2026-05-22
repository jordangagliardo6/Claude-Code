'use strict';

const axios = require('axios');
const { TARGET_CITIES, TARGET_TITLES, TARGET_INDUSTRIES, SW_MICHIGAN_CITIES } = require('../config');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Fetch up to `limit` qualified leads from Apollo.io.
 * Makes multiple paginated requests if needed.
 *
 * @param {number} limit  Maximum leads to return
 * @returns {Promise<Array>} Array of normalized lead objects
 */
async function fetchLeads(limit = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const collected = [];
  let page = 1;

  while (collected.length < limit) {
    const data = await searchPage(apiKey, page);
    const people = data.people || [];

    if (people.length === 0) break;

    for (const person of people) {
      if (collected.length >= limit) break;
      const lead = normalizePerson(person);
      if (lead) collected.push(lead);
    }

    // Stop if Apollo says there are no more pages
    const pagination = data.pagination || {};
    if (page >= (pagination.total_pages || 1)) break;

    page++;
  }

  return collected;
}

/**
 * Quick connectivity check — returns true if the API key is accepted.
 */
async function testConnection() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  // Hit a lightweight endpoint to verify auth
  const res = await axios.get(`${APOLLO_BASE}/auth/health`, {
    params: { api_key: apiKey },
    timeout: 10000,
  });
  return res.status === 200;
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

async function searchPage(apiKey, page) {
  const payload = {
    api_key: apiKey,
    page,
    per_page: 25,

    // Target decision-maker titles only
    person_titles: TARGET_TITLES,

    // Limit company employee count to owner-operated range (1–25)
    organization_num_employees_ranges: ['1,25'],

    // Company must be in Michigan
    organization_locations: TARGET_CITIES,

    // Industry keyword tags
    q_organization_keyword_tags: TARGET_INDUSTRIES,

    // Request contacts Apollo has phone data for
    contact_phone_status: ['likely_to_engage'],
  };

  const res = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30000,
    }
  );

  return res.data;
}

/**
 * Convert a raw Apollo person record into the shape our workflow expects.
 * Returns null if the record should be skipped (no phone, wrong location, etc.)
 */
function normalizePerson(person) {
  const phone = pickBestPhone(person);
  if (!phone) return null; // skip contacts with no phone number

  const org = person.organization || {};
  const city = pickCity(person, org);

  // Only keep leads in our SW Michigan target area
  if (!isSouthwestMichigan(city)) return null;

  return {
    businessName: (org.name || '').trim(),
    firstName:    (person.first_name || '').trim(),
    lastName:     (person.last_name  || '').trim(),
    phone,
    city:         city || '',
    website:      cleanUrl(org.website_url || ''),
  };
}

// Phone-number priority: mobile > direct dial > first available
function pickBestPhone(person) {
  // Apollo v1 surfaces these top-level fields after enrichment
  if (person.mobile_phone) return formatPhone(person.mobile_phone);

  const numbers = person.phone_numbers || [];
  if (!numbers.length) return null;

  const mobile = numbers.find(p => p.type === 'mobile');
  const direct = numbers.find(p => p.type === 'direct_dial');
  const best   = mobile || direct || numbers[0];
  const raw    = best.sanitized_number || best.raw_number || '';
  return formatPhone(raw);
}

// Normalise to plain 10-digit US number, or null
function formatPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

// Prefer org city; fall back to person-level city field
function pickCity(person, org) {
  return (
    (org.city || '').trim() ||
    // org.raw_address can be "123 Main St, Kalamazoo, MI 49001, USA"
    (org.raw_address || '').split(',')[1]?.trim() ||
    (person.city || '').trim()
  );
}

function isSouthwestMichigan(city) {
  if (!city) return false;
  const lower = city.toLowerCase();
  return SW_MICHIGAN_CITIES.some(c => lower.includes(c));
}

function cleanUrl(url) {
  if (!url) return '';
  // Strip trailing slash for a consistent look
  return url.replace(/\/$/, '');
}

module.exports = { fetchLeads, testConnection };
