'use strict';

const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

const APOLLO_API_BASE = 'https://api.apollo.io/api/v1';

// Build one location string per target city, e.g. "Kalamazoo, Michigan, United States"
function buildLocationList() {
  return config.TARGET_CITIES.map(city => `${city}, Michigan, United States`);
}

/**
 * Search Apollo.io for HVAC contacts in Southwest Michigan.
 *
 * Apollo's mixed_people/search returns contacts with their company context.
 * We request up to `maxLeads` per call.  Because Apollo paginates and the
 * data changes daily, we always fetch page 1 — the freshest results.
 *
 * @param {number} maxLeads  How many contacts to request (max 25 by default).
 * @returns {Promise<Contact[]>}  Normalised lead objects ready for the sheet.
 */
async function searchLeads(maxLeads = config.maxLeadsPerRun) {
  if (!config.apolloApiKey) {
    throw new Error('APOLLO_API_KEY is not set in your .env file.');
  }

  const payload = {
    // ── Location ────────────────────────────────────────────────────────────
    // Targets every city in the TARGET_CITIES list.
    // To search all of Michigan instead, replace with ["Michigan, United States"].
    person_locations: buildLocationList(),

    // ── Job Titles ───────────────────────────────────────────────────────────
    // Apollo does a broad match — "Owner" also matches "Business Owner", etc.
    person_titles: config.JOB_TITLES,

    // ── Company Size ─────────────────────────────────────────────────────────
    // "1,25" = 1–25 employees. Format is always "min,max".
    organization_num_employees_ranges: [config.EMPLOYEE_RANGE],

    // ── Industry Keywords ────────────────────────────────────────────────────
    // Apollo matches these against the company's industry tags.
    // Tip: use Apollo's UI to find exact tag IDs if keyword matching is too broad.
    q_organization_keyword_tags: config.INDUSTRIES,

    // ── Require a Phone Number ───────────────────────────────────────────────
    // "likely to engage" = Apollo has a phone on file (mobile or direct).
    // Change to "verified" for stricter filtering (fewer but confirmed numbers).
    contact_phone_status: ['likely to engage'],

    per_page: maxLeads,
    page: 1,
  };

  logger.info(`Searching Apollo for up to ${maxLeads} HVAC leads in SW Michigan…`);
  logger.info(`Cities: ${config.TARGET_CITIES.join(', ')}`);

  const response = await axios.post(
    `${APOLLO_API_BASE}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.apolloApiKey,
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    }
  );

  const people = response.data?.people ?? [];
  logger.info(`Apollo returned ${people.length} raw contacts.`);

  return people
    .map(normalisePerson)
    .filter(lead => lead.phone); // final safety check — skip if no phone resolved
}

/**
 * Normalise a raw Apollo contact object into a flat lead record.
 * Picks the best available phone number (mobile > direct > any).
 */
function normalisePerson(person) {
  const phones = person.phone_numbers ?? [];

  // Prefer mobile, then direct, then whatever Apollo has
  const mobile = phones.find(p => p.type === 'mobile');
  const direct = phones.find(p => p.type === 'direct_phone');
  const best = mobile || direct || phones[0];

  const org = person.organization ?? {};

  // Apollo may return the contact's city or the company's city
  const city =
    person.city ||
    person.present_raw_address?.split(',')[0]?.trim() ||
    org.city ||
    '';

  return {
    businessName:  org.name ?? '',
    firstName:     person.first_name ?? '',
    lastName:      person.last_name ?? '',
    phone:         best?.sanitized_number ?? best?.raw_number ?? '',
    city:          city,
    website:       org.website_url ?? '',
    apolloId:      person.id,
  };
}

module.exports = { searchLeads };
