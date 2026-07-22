/**
 * apollo.js — Apollo.io REST API helpers.
 *
 * Endpoints used:
 *   POST /v1/mixed_people/search  → find people matching industry + location + title filters
 *   POST /v1/people/bulk_match    → enrich a batch of people and reveal phone numbers (async)
 *   GET  /v1/requests/:id         → poll for async enrichment results
 *
 * Phone reveal costs credits on your Apollo plan. The workflow reveals phones only
 * for candidates that are NOT already in your sheet, capped at maxLeadsPerRun.
 */

const axios = require('axios');
const config = require('./config');

const BASE = 'https://api.apollo.io/v1';

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Search Apollo's people database for HVAC decision-makers in SW Michigan.
 * Returns raw Apollo person objects (no phone numbers yet).
 *
 * @param {number} page     - 1-based page number
 * @param {number} perPage  - results per page (max 100)
 */
async function searchHVACPeople(page = 1, perPage = 50) {
  const apiKey = requireEnv('APOLLO_API_KEY');

  const body = {
    api_key: apiKey,
    page,
    per_page: perPage,

    // Target decision-maker titles only
    person_titles: config.jobTitles,
    include_similar_titles: true, // catches "Co-Owner", "Managing Director", etc.

    // Southwest Michigan cities
    organization_locations: config.cities,

    // Owner-operated small businesses: 1–25 employees
    organization_num_employees_ranges: [config.employeeRange],

    // HVAC / plumbing / mechanical SIC codes
    organization_sic_codes: config.sicCodes,

    // Keyword boost for relevance
    q_organization_keyword_tags: config.industryKeywords,
  };

  const { data } = await axios.post(`${BASE}/mixed_people/search`, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });

  return data.people || [];
}

// ── Phone Enrichment ──────────────────────────────────────────────────────────

/**
 * Bulk-enrich a list of Apollo person objects to reveal their phone numbers.
 * Phone enrichment is always async: submits a job then polls until done.
 *
 * @param {object[]} people - Apollo person objects from searchHVACPeople()
 * @returns {object[]} Enriched person objects with phone_numbers populated
 */
async function bulkRevealPhones(people) {
  if (!people.length) return [];
  const apiKey = requireEnv('APOLLO_API_KEY');

  // Build the details array Apollo expects for bulk match
  const details = people.map(p => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    organization_name: p.organization_name || '',
    domain: p.organization?.primary_domain || '',
  }));

  const { data } = await axios.post(
    `${BASE}/people/bulk_match`,
    { api_key: apiKey, reveal_phone_number: true, details },
    { headers: { 'Content-Type': 'application/json' }, timeout: 30_000 }
  );

  // Apollo sometimes returns matches inline (no async needed)
  if (data.matches?.length) return data.matches;

  // Otherwise poll for the async result
  const requestId = data.request_id;
  if (!requestId) {
    console.warn('Apollo bulk match returned neither matches nor a request_id.');
    return [];
  }

  return await pollEnrichmentResults(requestId, apiKey);
}

/**
 * Poll Apollo's request endpoint until the enrichment job completes.
 */
async function pollEnrichmentResults(requestId, apiKey) {
  const deadline = Date.now() + config.phoneEnrichmentTimeoutMs;

  while (Date.now() < deadline) {
    await sleep(config.phoneEnrichmentPollIntervalMs);

    let resp;
    try {
      resp = await axios.get(`${BASE}/requests/${requestId}`, {
        params: { api_key: apiKey },
        timeout: 15_000,
      });
    } catch (err) {
      // 404 means the job isn't ready yet — keep polling
      if (err.response?.status === 404) continue;
      throw err;
    }

    const { status, matches, people } = resp.data;

    if (status === 'complete' || status === 'completed') {
      return matches || people || [];
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`Apollo phone enrichment job failed: ${JSON.stringify(resp.data)}`);
    }
    // status is "pending" or "processing" — keep polling
  }

  throw new Error(
    `Apollo phone enrichment timed out after ${config.phoneEnrichmentTimeoutMs / 1000}s (request_id: ${requestId})`
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pick the best available phone number from an enriched person object.
 * Priority: mobile > direct > any other type.
 *
 * @param {object} person - Enriched Apollo person
 * @returns {string|null}  E.164-ish sanitized number, or null if none found
 */
function extractBestPhone(person) {
  const numbers = person.phone_numbers || [];
  const byType = type => numbers.find(n => n.type === type);
  const best = byType('mobile') || byType('direct') || numbers[0];
  // Fall back to top-level sanitized_phone if phone_numbers is empty
  return best?.sanitized_number || person.sanitized_phone || null;
}

/**
 * Extract a clean website URL from a person/organization object.
 */
function extractWebsite(person) {
  return (
    person.organization?.website_url ||
    person.organization?.primary_domain && `https://${person.organization.primary_domain}` ||
    person.present_raw_address || // sometimes contains domain
    ''
  );
}

function requireEnv(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Environment variable ${key} is not set. Add it to your .env file.`);
  return val;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchHVACPeople, bulkRevealPhones, extractBestPhone, extractWebsite };
