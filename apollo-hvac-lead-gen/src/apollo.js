'use strict';

const axios = require('axios');
const { CITIES, TITLES, INDUSTRY_KEYWORDS, EMPLOYEE_RANGES } = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// ─── Main search ──────────────────────────────────────────────────────────────

/**
 * Fetch HVAC decision-maker leads from Apollo.io.
 * Returns an array of normalised lead objects (see mapPerson).
 *
 * @param {number} maxResults  Hard cap on how many leads to return.
 */
async function searchHVACLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const leads = [];
  let page = 1;
  const PER_PAGE = 25; // keep each page small to stay inside rate limits

  while (leads.length < maxResults) {
    const needed = maxResults - leads.length;
    const perPage = Math.min(PER_PAGE, needed + 10); // fetch a few extra to cover phone-less contacts

    let response;
    try {
      response = await apolloPost('/mixed_people/search', {
        api_key: apiKey,
        page,
        per_page: perPage,
        person_titles: TITLES,
        organization_locations: CITIES,
        organization_num_employees_ranges: EMPLOYEE_RANGES,
        // Keyword search to bias results toward trades / HVAC companies
        q_keywords: INDUSTRY_KEYWORDS.join(' OR '),
        // Only surface contacts Apollo has enriched with phone data
        person_has_phone: true,
      });
    } catch (err) {
      // Re-throw with context so the caller can surface a useful error message
      throw new Error(`Apollo API request failed (page ${page}): ${err.message}`);
    }

    const people = response.data?.people ?? [];
    const pagination = response.data?.pagination ?? {};

    if (people.length === 0) break;

    // Secondary phone filter — Apollo's person_has_phone flag can be unreliable on
    // free/basic plans, so we double-check client-side.
    const withPhone = people.filter(
      (p) => Array.isArray(p.phone_numbers) && p.phone_numbers.length > 0,
    );

    for (const person of withPhone) {
      if (leads.length >= maxResults) break;
      leads.push(mapPerson(person));
    }

    if (page >= (pagination.total_pages ?? 1) || leads.length >= maxResults) break;

    page++;
    await sleep(600); // 600 ms between pages — stays comfortably below Apollo's rate limit
  }

  return leads;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function apolloPost(path, body, attempt = 1) {
  try {
    return await axios.post(`${APOLLO_BASE}${path}`, body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      timeout: 30_000,
    });
  } catch (err) {
    if (err.response?.status === 429 && attempt <= 3) {
      // Respect Retry-After header or back off exponentially
      const wait = parseInt(err.response.headers['retry-after'] ?? '0', 10) || attempt * 10;
      console.warn(`Apollo rate-limited — waiting ${wait}s before retry ${attempt}/3`);
      await sleep(wait * 1000);
      return apolloPost(path, body, attempt + 1);
    }

    if (err.response) {
      const detail = JSON.stringify(err.response.data ?? {});
      throw new Error(`Apollo HTTP ${err.response.status}: ${detail}`);
    }
    throw err;
  }
}

// ─── Data mapping ─────────────────────────────────────────────────────────────

/**
 * Normalise a raw Apollo person object to a flat lead record.
 */
function mapPerson(person) {
  const org = person.organization ?? {};

  // Prefer mobile → direct → any number (mobile = best chance owner answers)
  const phones = person.phone_numbers ?? [];
  const phone =
    phones.find((p) => p.type === 'mobile') ??
    phones.find((p) => p.type === 'direct') ??
    phones[0];

  const rawNumber = phone?.sanitized_number ?? phone?.raw_number ?? '';

  return {
    businessName: org.name ?? '',
    firstName: person.first_name ?? '',
    lastName: person.last_name ?? '',
    phone: formatPhone(rawNumber),
    city: org.city ?? person.city ?? extractCity(person.location) ?? '',
    website: normaliseUrl(org.website_url ?? ''),
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function extractCity(location) {
  if (!location) return '';
  return location.split(',')[0]?.trim() ?? '';
}

function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw; // return as-is if we can't cleanly format it
}

function normaliseUrl(url) {
  if (!url) return '';
  // Ensure the URL has a scheme so it renders as a hyperlink in Sheets
  if (!/^https?:\/\//i.test(url)) return `https://${url}`;
  return url;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { searchHVACLeads };
