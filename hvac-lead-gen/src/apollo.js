/**
 * Apollo.io API client
 *
 * Searches for HVAC/Plumbing/Mechanical decision-makers in SW Michigan
 * and enriches results with direct/mobile phone numbers.
 *
 * To change target cities: update SW_MICHIGAN_LOCATIONS below.
 * To change target industries: update NAICS_CODES / INDUSTRY_KEYWORDS.
 * To change target titles: update TARGET_TITLES.
 */

const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/v1';

// ─────────────────────────────────────────────────────────────────────────────
// Search configuration — easy to modify
// ─────────────────────────────────────────────────────────────────────────────

const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Job titles in priority order; Apollo will also match similar titles
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// NAICS 238220 = Plumbing, Heating, Air-Conditioning Contractors
// Prefix match: '23822' covers all sub-codes under 238220–238299
const NAICS_CODES = ['23822'];

// SIC 1711 = Plumbing, Heating, Air-Conditioning
const SIC_CODES = ['1711'];

// Keyword tags boost relevance within the NAICS/SIC filter
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'air conditioning contractor',
  'heating contractor',
];

// ─────────────────────────────────────────────────────────────────────────────

function getApiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  return key;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Step 1 — Search for HVAC decision-makers in SW Michigan.
 * Returns raw Apollo person records (no phone numbers yet).
 *
 * @param {number} fetchLimit  How many candidates to pull (typically 3× desired leads to allow for filtering)
 */
async function searchHvacPeople(fetchLimit = 75) {
  const apiKey = getApiKey();

  const payload = {
    api_key: apiKey,
    page: 1,
    per_page: Math.min(fetchLimit, 100),
    person_titles: TARGET_TITLES,
    person_seniorities: ['owner', 'founder', 'c_suite'],
    include_similar_titles: true,
    organization_locations: SW_MICHIGAN_LOCATIONS,
    organization_num_employees_ranges: ['1,25'],
    organization_naics_codes: NAICS_CODES,
    organization_sic_codes: SIC_CODES,
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
  };

  const response = await axios.post(`${BASE_URL}/mixed_people/search`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });

  return response.data.people || [];
}

/**
 * Step 2 — Enrich people with phone numbers.
 * Apollo's bulk_match with reveal_phone_number=true is asynchronous on most plans:
 * the response returns a request_id, and we poll until results arrive.
 *
 * Processes in batches of 10 (Apollo limit per call).
 *
 * @param {Array} people  Raw search results from searchHvacPeople()
 */
async function enrichWithPhones(people) {
  if (!people.length) return [];

  const apiKey = getApiKey();
  const allResults = [];

  for (let i = 0; i < people.length; i += 10) {
    const batch = people.slice(i, i + 10);
    const details = batch.map((p) => ({ id: p.id }));

    try {
      const response = await axios.post(
        `${BASE_URL}/people/bulk_match`,
        { api_key: apiKey, details, reveal_phone_number: true },
        { headers: { 'Content-Type': 'application/json' }, timeout: 30_000 }
      );

      const data = response.data;

      if (data.matches && Array.isArray(data.matches)) {
        // Synchronous response — phones returned immediately
        allResults.push(...data.matches.filter(Boolean));
      } else if (data.request_id) {
        // Asynchronous response — poll for results
        const polled = await pollPhoneResults(data.request_id, apiKey);
        allResults.push(...polled.filter(Boolean));
      } else {
        console.warn(`[Apollo] Unexpected enrichment response: ${JSON.stringify(data).slice(0, 200)}`);
      }
    } catch (err) {
      const detail = err.response
        ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data).slice(0, 300)}`
        : err.message;
      console.warn(`[Apollo] Enrichment batch ${i + 1}–${i + batch.length} failed: ${detail}`);
    }

    // Pause between batches to stay within Apollo rate limits
    if (i + 10 < people.length) {
      await sleep(1_500);
    }
  }

  return allResults;
}

/**
 * Poll Apollo's async phone enrichment job until it's complete.
 * Apollo typically takes 5–15 seconds per batch.
 *
 * If your plan returns phones synchronously, this function is never called.
 */
async function pollPhoneResults(requestId, apiKey, maxAttempts = 12, intervalMs = 4_000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(intervalMs);

    try {
      // Apollo's polling endpoint for async phone enrichment
      const response = await axios.get(`${BASE_URL}/people/phone_request/${requestId}`, {
        params: { api_key: apiKey },
        timeout: 15_000,
      });

      const { status, matches } = response.data;

      if (status === 'success' || (Array.isArray(matches) && matches.length)) {
        return matches || [];
      }

      if (status === 'failed') {
        console.warn(`[Apollo] Phone enrichment job ${requestId} failed on Apollo's side.`);
        return [];
      }

      // Still pending — keep polling
    } catch (err) {
      if (err.response && err.response.status === 404) {
        // Not ready yet — normal during the first few attempts
        continue;
      }
      console.warn(`[Apollo] Poll attempt ${attempt}/${maxAttempts} error: ${err.message}`);
    }
  }

  console.warn(`[Apollo] Phone enrichment timed out for request ${requestId} after ${maxAttempts} attempts.`);
  return [];
}

/**
 * Extract the lead fields we need from an enriched Apollo person record.
 * Returns null if there is no phone number (those contacts are skipped).
 *
 * @param {Object} person  Enriched person from Apollo
 */
function extractLead(person) {
  const phones = person.phone_numbers || [];

  // Priority: mobile → direct → any available number
  const phone =
    phones.find((p) => p.type === 'mobile') ||
    phones.find((p) => p.type === 'direct_phone') ||
    phones[0];

  if (!phone) return null;

  const org = person.organization || {};

  // Normalize city — strip ", MI" or ", Michigan" suffixes if present
  const rawCity = person.city || org.city || '';
  const city = rawCity.replace(/,\s*(MI|Michigan)$/i, '').trim();

  // Strip Apollo's partial-masking markers from last names (e.g. "Smi[th]")
  const lastName = (person.last_name || '').replace(/\[.*?\]/g, '').trim();

  return {
    businessName: (org.name || '').trim(),
    firstName: (person.first_name || '').trim(),
    lastName,
    phone: phone.sanitized_number || phone.raw_number || '',
    city,
    website: org.website_url || '',
  };
}

module.exports = { searchHvacPeople, enrichWithPhones, extractLead };
