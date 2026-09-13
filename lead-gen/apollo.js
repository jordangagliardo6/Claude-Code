const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// Build axios instance with the API key header
function apolloClient() {
  return axios.create({
    baseURL: APOLLO_BASE,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': process.env.APOLLO_API_KEY,
    },
    timeout: 30000,
  });
}

/**
 * Search Apollo for HVAC owner contacts in Southwest Michigan.
 * Returns an array of raw Apollo person objects.
 *
 * Apollo's /mixed_people/api_search requires a paid plan.
 * The people search endpoint does NOT return phone numbers directly —
 * call enrichPeoplePhones() after this to reveal them.
 */
async function searchHvacLeads(page = 1) {
  const client = apolloClient();

  const payload = {
    person_titles: config.JOB_TITLES,
    person_seniorities: config.SENIORITIES,
    person_locations: [config.PERSON_LOCATION],
    organization_num_employees_ranges: config.EMPLOYEE_RANGES,
    q_organization_keyword_tags: config.INDUSTRY_TAGS,
    organization_sic_codes: config.INDUSTRY_SIC_CODES,
    // include_similar_titles: false keeps results tight to exact title matches
    include_similar_titles: false,
    page,
    per_page: config.MAX_LEADS_PER_RUN,
  };

  const res = await client.post('/mixed_people/api_search', payload);
  return res.data.people || [];
}

/**
 * Enrich up to 10 people at a time to reveal phone numbers.
 * Accepts an array of Apollo person objects from searchHvacLeads().
 * Returns enriched person objects with phone_numbers populated.
 *
 * Note: reveal_phone_number is ASYNC on Apollo — the response returns a
 * request_id and no numbers. This function polls /webhook_result_show
 * for up to 60 seconds to retrieve the result.
 */
async function enrichPeoplePhones(people) {
  if (!people.length) return [];
  const client = apolloClient();

  // Chunk into batches of 10 (API max)
  const results = [];
  for (let i = 0; i < people.length; i += 10) {
    const batch = people.slice(i, i + 10);
    const details = batch.map((p) => ({ id: p.id }));

    const res = await client.post('/people/bulk_match', {
      details,
      reveal_phone_number: true,
    });

    const requestId = res.data.request_id;
    if (!requestId) {
      // Sync response — phone data may already be present
      const matched = res.data.matches || [];
      results.push(...matched);
      continue;
    }

    // Poll for async result
    const enriched = await pollWebhookResult(client, requestId);
    results.push(...(enriched || []));
  }

  return results;
}

/**
 * Polls /webhook_result_show until the result is ready or timeout is reached.
 */
async function pollWebhookResult(client, requestId, maxWaitMs = 60000) {
  const interval = 5000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await sleep(interval);
    try {
      const res = await client.get(`/webhook_result_show?id=${requestId}`);
      if (res.data && res.data.status === 'complete') {
        return res.data.matches || [];
      }
    } catch (err) {
      if (err.response && err.response.status === 404) {
        // Not ready yet — keep polling
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Timed out waiting for Apollo webhook result: ${requestId}`);
}

/**
 * Extract the city from a person record, filtering for Southwest Michigan cities.
 * Returns null if the person's city isn't in our target list.
 */
function extractSwMichiganCity(person) {
  const city = person.city || person.present_raw_address || '';
  const normalized = city.toLowerCase();
  return (
    config.SW_MICHIGAN_CITIES.find((c) => normalized.includes(c.toLowerCase())) || null
  );
}

/**
 * Map an enriched Apollo person object to the row format expected by the sheet.
 * Returns null if the person lacks a phone number (per requirements).
 */
function mapToSheetRow(person, dateAdded) {
  const phone = bestPhone(person);
  if (!phone) return null; // Exclude contacts with no phone

  const city =
    extractSwMichiganCity(person) ||
    person.city ||
    person.present_raw_address ||
    '';

  return [
    dateAdded,
    person.organization_name || person.account?.name || '',
    person.first_name || '',
    person.last_name || '',
    phone,
    city,
    person.organization?.website_url || person.account?.website_url || '',
    '', // Called — intentionally blank
    '', // Notes — intentionally blank
  ];
}

/**
 * Pick the best available phone number from a person record.
 * Prefers direct/mobile numbers over company lines.
 */
function bestPhone(person) {
  const phones = person.phone_numbers || [];
  const prioritized = ['direct_phone', 'mobile_phone', 'other'];
  for (const type of prioritized) {
    const found = phones.find((p) => p.type === type && p.sanitized_number);
    if (found) return found.sanitized_number;
  }
  // Fall back to any sanitized number
  const any = phones.find((p) => p.sanitized_number);
  return any ? any.sanitized_number : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  searchHvacLeads,
  enrichPeoplePhones,
  extractSwMichiganCity,
  mapToSheetRow,
};
