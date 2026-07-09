'use strict';

/**
 * Apollo.io REST API module.
 *
 * Flow:
 *   1. searchPeople()   — search by title + location + industry (no credits consumed)
 *   2. enrichForPhones() — call bulk_match to unlock phone numbers (costs export credits)
 *   3. toRow()          — flatten enriched record into a sheet-ready object
 *
 * Credit cost note:
 *   Apollo charges 1 export credit per person in bulk_match with reveal_phone_number:true.
 *   Running 25 leads/day = ~750 credits/month. Apollo Basic plan includes 1,000/month.
 *   To reduce cost, lower MAX_LEADS_PER_RUN in config.js.
 */

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// Apollo bulk_match accepts at most 10 records per request.
const BULK_BATCH_SIZE = 10;

// Brief pause between enrichment batches to respect Apollo rate limits.
const BATCH_PAUSE_MS = 600;

/**
 * Search Apollo's people database for HVAC decision-makers in each target city.
 * Results do NOT include phone numbers yet — see enrichForPhones().
 *
 * @returns {Array} Raw Apollo person objects, deduplicated across cities.
 */
async function searchPeople() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const seen = new Set();
  const results = [];

  // Fetch a buffer so we have enough to fill the quota after phone filtering
  const fetchTarget = config.MAX_LEADS_PER_RUN * 3;

  for (const city of config.TARGET_CITIES) {
    if (results.length >= fetchTarget) break;

    try {
      const { data } = await axios.post(
        `${APOLLO_BASE}/mixed_people/search`,
        {
          api_key: apiKey,
          page: 1,
          per_page: 50,
          person_titles: config.TARGET_TITLES,
          organization_locations: [city],
          organization_num_employees_ranges: config.EMPLOYEE_RANGES,
          q_organization_keyword_tags: config.INDUSTRY_KEYWORDS,
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      const people = data.people || [];
      console.log(`   [Apollo] ${people.length} results for "${city}"`);

      for (const person of people) {
        if (person.id && !seen.has(person.id)) {
          seen.add(person.id);
          results.push(person);
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      console.warn(`   [Apollo] Warning for "${city}": ${msg}`);
      // Non-fatal — continue with other cities
    }
  }

  return results;
}

/**
 * Enrich a list of Apollo person records to reveal phone numbers.
 * Sends requests in batches of BULK_BATCH_SIZE.
 * If a batch fails, original (un-enriched) records are kept so we don't lose leads.
 *
 * @param {Array} people - Raw Apollo person objects from searchPeople().
 * @returns {Array} Enriched person objects with phone_numbers populated.
 */
async function enrichForPhones(people) {
  const apiKey = process.env.APOLLO_API_KEY;
  const enriched = [];

  for (let i = 0; i < people.length; i += BULK_BATCH_SIZE) {
    const batch = people.slice(i, i + BULK_BATCH_SIZE);
    const batchNum = Math.floor(i / BULK_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(people.length / BULK_BATCH_SIZE);

    try {
      const { data } = await axios.post(
        `${APOLLO_BASE}/people/bulk_match`,
        {
          api_key: apiKey,
          reveal_phone_number: true,
          details: batch.map(p => ({
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            organization_name: p.organization?.name || '',
          })),
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
      );

      const matches = data.matches || [];
      console.log(`   [Enrich] Batch ${batchNum}/${totalBatches}: ${matches.length} matched`);
      enriched.push(...matches);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      console.warn(`   [Enrich] Batch ${batchNum} failed (${msg}) — keeping un-enriched records`);
      // Fall back to original records; they won't have phones but won't be lost
      enriched.push(...batch);
    }

    // Pause between batches (skip after the last one)
    if (i + BULK_BATCH_SIZE < people.length) {
      await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  return enriched;
}

/**
 * Pick the best available phone number from an Apollo person record.
 * Priority: mobile > direct > work_hq > first available.
 *
 * @param {Object} person - Enriched Apollo person object.
 * @returns {string} Sanitized phone number, or '' if none available.
 */
function pickBestPhone(person) {
  const phones = person.phone_numbers || [];

  for (const preferredType of ['mobile', 'direct_phone', 'direct', 'work_hq']) {
    const match = phones.find(p => p.type === preferredType && p.sanitized_number);
    if (match) return match.sanitized_number;
  }

  // Fall back to the first phone of any type
  const first = phones.find(p => p.sanitized_number);
  if (first) return first.sanitized_number;

  // Last resort: top-level sanitized_phone field
  return person.sanitized_phone || '';
}

/**
 * Convert an Apollo person record into the flat object our Google Sheets
 * module expects. Column order matches config.SHEET_COLUMNS.
 *
 * @param {Object} person  - Enriched Apollo person record.
 * @param {string} dateAdded - Formatted date string to stamp the row.
 * @returns {Object} Flat lead object ready for appendRows().
 */
function toRow(person, dateAdded) {
  const org = person.organization || person.account || {};

  // City: prefer person-level city, fall back to org city
  const city = person.city || org.city || '';

  return {
    dateAdded,
    businessName: org.name || '',
    firstName:    person.first_name || '',
    lastName:     person.last_name || '',
    phone:        pickBestPhone(person),
    city,
    website:      org.website_url || '',
    called:       '',
    notes:        '',
  };
}

module.exports = { searchPeople, enrichForPhones, toRow };
