/**
 * Apollo.io People Search integration.
 *
 * Uses the v1 REST API with an APOLLO_API_KEY environment variable.
 * Doc reference: https://apolloio.github.io/apollo-api-docs/
 *
 * Phone numbers on free/basic plans may require a separate reveal call
 * (costs credits). If `phone_numbers` comes back empty, see README section
 * "Unlocking phone numbers on Apollo".
 */

const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

const BASE_URL = 'https://api.apollo.io/v1';

// Builds the search payload sent to Apollo's people-search endpoint
function buildSearchPayload(page) {
  return {
    // Location is scoped to the company's office, not the contact's residence
    organization_locations: config.cities,

    // Filter by decision-maker titles
    person_titles: config.targetTitles,

    // 1–25 employees catches owner-operated shops; "1,25" is Apollo's range syntax
    q_organization_num_employees_ranges: [config.employeeRange],

    // Industry keyword tags — Apollo matches any tag in the array
    q_organization_keyword_tags: config.industryKeywords,

    // Only surface contacts that have a revealed phone number already in Apollo's DB
    // Remove this line if you want all matches (including those with no phone)
    has_phone: true,

    page,
    per_page: config.maxLeadsPerRun,
  };
}

async function searchLeads(page = 1) {
  const payload = buildSearchPayload(page);

  const response = await axios.post(
    `${BASE_URL}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': process.env.APOLLO_API_KEY,
      },
      timeout: 30_000,
    },
  );

  const people = response.data?.people ?? [];
  logger.info(`Apollo returned ${people.length} contact(s) on page ${page}`);
  return people;
}

// Extract only the fields we need for the spreadsheet
function extractLeadData(person) {
  const phones = person.phone_numbers ?? [];

  // Priority: mobile > work_direct > any other
  const phone =
    phones.find(p => p.type === 'mobile') ??
    phones.find(p => p.type === 'work_direct') ??
    phones[0];

  const rawPhone = phone?.sanitized_number ?? phone?.raw_number ?? '';
  const website =
    person.organization?.website_url ??
    person.website_url ??
    '';

  return {
    businessName: (person.organization_name ?? '').trim(),
    firstName:    (person.first_name ?? '').trim(),
    lastName:     (person.last_name  ?? '').trim(),
    phoneNumber:  rawPhone,
    city:         (person.city ?? '').trim(),
    website:      website.trim(),
  };
}

module.exports = { searchLeads, extractLeadData };
