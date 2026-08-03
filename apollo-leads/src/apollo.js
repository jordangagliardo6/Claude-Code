/**
 * Apollo.io API client.
 *
 * Workflow:
 *   1. searchPeople()  — finds matching people in Apollo's database (no phones yet)
 *   2. enrichPeople()  — bulk-enriches those people to reveal phone numbers
 *   3. findLeads()     — orchestrates both steps and returns clean lead objects
 *
 * Apollo API reference: https://docs.apollo.io/reference/introduction
 */

const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// Delay helper to respect Apollo rate limits between requests.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Search Apollo's people database.
 * Returns an array of partial person objects (no phone numbers yet).
 *
 * @param {string} apiKey
 * @param {string[]} locations   - person_locations values (city, state)
 * @param {number}  perPage      - results per page (max 100)
 * @returns {object[]}
 */
async function searchPeople(apiKey, locations, perPage = 25) {
  const payload = {
    api_key: apiKey,
    per_page: perPage,
    page: 1,

    // Job titles (also matches similar titles like "Co-Owner", "Managing Partner")
    person_titles: config.apollo.targetTitles,
    include_similar_titles: true,

    // Seniority guard to avoid matching junior roles with "owner" in their name
    person_seniorities: config.apollo.seniorities,

    // Location filter — where the PERSON is based (not just company HQ)
    person_locations: locations,

    // Company size: 1–25 employees
    organization_num_employees_ranges: config.apollo.employeeRanges,

    // Industry filters
    q_organization_keyword_tags: config.apollo.industryKeywords,
    organization_naics_codes: config.apollo.naicsCodes,
  };

  logger.info(`Apollo search: ${locations.length} locations, titles: ${config.apollo.targetTitles.join(', ')}`);

  try {
    const res = await axios.post(
      `${APOLLO_BASE}/mixed_people/search`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30_000,
      }
    );

    const people = res.data?.people || [];
    const total  = res.data?.pagination?.total_entries || 0;
    logger.info(`Apollo search returned ${people.length} results (${total} total available)`);
    return people;
  } catch (err) {
    const status  = err.response?.status;
    const message = err.response?.data?.error || err.message;
    throw new Error(`Apollo search failed (HTTP ${status}): ${message}`);
  }
}

/**
 * Bulk-enrich a list of Apollo person IDs to get full contact data including phones.
 * Apollo limits bulk_match to 10 people per request, so we chunk automatically.
 *
 * @param {string}   apiKey
 * @param {object[]} people   - partial person objects from searchPeople()
 * @returns {object[]}        - enriched person objects
 */
async function enrichPeople(apiKey, people) {
  if (!people.length) return [];

  const CHUNK = 10; // Apollo bulk_match limit
  const enriched = [];

  for (let i = 0; i < people.length; i += CHUNK) {
    const chunk = people.slice(i, i + CHUNK);

    const details = chunk.map((p) => ({
      id:             p.id,
      first_name:     p.first_name,
      last_name:      p.last_name,
      organization:   { name: p.organization?.name },
      domain:         p.organization?.primary_domain,
    }));

    try {
      const res = await axios.post(
        `${APOLLO_BASE}/people/bulk_match`,
        {
          api_key: apiKey,
          details,
          reveal_personal_emails: false, // we only need phones
          reveal_phone_number:    true,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30_000,
        }
      );

      const matches = res.data?.matches || [];
      enriched.push(...matches);
      logger.info(`Enriched chunk ${Math.floor(i / CHUNK) + 1}: ${matches.length}/${chunk.length} matched`);
    } catch (err) {
      const status  = err.response?.status;
      const message = err.response?.data?.error || err.message;
      logger.warn(`Enrichment chunk ${Math.floor(i / CHUNK) + 1} failed (HTTP ${status}): ${message}`);
    }

    // Respect Apollo rate limits: 1 request/second on most plans
    if (i + CHUNK < people.length) await sleep(1100);
  }

  return enriched;
}

/**
 * Extract the best available phone number from an enriched person object.
 * Priority: mobile > direct > sanitized_phone > first available.
 *
 * @param {object} person
 * @returns {string|null}
 */
function extractBestPhone(person) {
  const phones = person.phone_numbers || [];

  // Try mobile first
  const mobile = phones.find((p) => p.type === 'mobile' || p.type === 'personal_mobile');
  if (mobile?.sanitized_number) return mobile.sanitized_number;

  // Then direct/work direct
  const direct = phones.find((p) => p.type === 'direct' || p.type === 'work');
  if (direct?.sanitized_number) return direct.sanitized_number;

  // Fall back to whatever Apollo returned
  if (phones[0]?.sanitized_number) return phones[0].sanitized_number;

  // Last resort: top-level sanitized_phone field
  return person.sanitized_phone || null;
}

/**
 * Extract the city from an enriched person, trying multiple fields.
 */
function extractCity(person) {
  // Person's own location (most accurate)
  if (person.city) return person.city;

  // Fall back to company city
  if (person.organization?.city) return person.organization.city;

  return '';
}

/**
 * Main entry point: search + enrich + clean up into a uniform lead shape.
 *
 * @param {string} apiKey
 * @param {number} maxLeads
 * @returns {object[]} leads with shape:
 *   { businessName, firstName, lastName, phone, city, website }
 */
async function findLeads(apiKey, maxLeads = 25) {
  // Step 1: search — request more than we need so we have buffer after phone filtering
  const searchLimit = Math.min(maxLeads * 3, 100);
  const rawPeople   = await searchPeople(apiKey, config.apollo.targetLocations, searchLimit);

  if (!rawPeople.length) {
    logger.warn('Apollo search returned 0 results. Check filters or API quota.');
    return [];
  }

  // Step 2: enrich to get phone numbers
  const enriched = await enrichPeople(apiKey, rawPeople);

  // Step 3: filter — must have a phone number
  const withPhone = enriched.filter((p) => extractBestPhone(p));
  logger.info(`${withPhone.length}/${enriched.length} enriched contacts have a phone number`);

  // Step 4: map to clean lead shape, cap at maxLeads
  const leads = withPhone.slice(0, maxLeads).map((p) => ({
    businessName: p.organization?.name || '',
    firstName:    p.first_name || '',
    lastName:     p.last_name || '',
    phone:        extractBestPhone(p),
    city:         extractCity(p),
    website:      p.organization?.website_url || p.organization?.primary_domain || '',
  }));

  logger.info(`Returning ${leads.length} leads after filtering`);
  return leads;
}

module.exports = { findLeads, searchPeople, enrichPeople };
