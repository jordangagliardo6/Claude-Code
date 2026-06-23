// ---------------------------------------------------------------------------
// Apollo.io API client: people search + phone-number enrichment.
//
// Two-step process for getting a usable phone number:
//   1. mixed_people/search  -> finds matching people, but Apollo withholds
//      mobile/direct-dial numbers from search results.
//   2. people/match (enrichment) with reveal_phone_number: true -> Apollo
//      delivers the actual number asynchronously to a webhook
//      (see src/phoneWebhookServer.js), which we wait on with a timeout.
//
// If PHONE_REVEAL_WEBHOOK_URL isn't configured, step 2 is skipped and we
// only keep leads that already had a phone number on the search record.
// ---------------------------------------------------------------------------

const axios = require('axios');
const config = require('../config');
const { waitForReveal } = require('./phoneRevealStore');

const API_BASE = 'https://api.apollo.io/api/v1';

function client() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY is not set in .env');
  }
  return axios.create({
    baseURL: API_BASE,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    timeout: 20_000,
  });
}

/**
 * Searches Apollo for people matching the configured filters
 * (industries, company size, Michigan locations, job titles).
 * Returns the raw array of Apollo "person" objects across all pages
 * requested (up to config.apolloMaxPages).
 */
async function searchPeople() {
  const http = client();
  const personLocations = config.targetCities.map(
    (city) => `${city}, ${config.state}, ${config.country}`
  );

  let allPeople = [];

  for (let page = 1; page <= config.apolloMaxPages; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const response = await http.post('/mixed_people/search', {
      person_titles: config.targetTitles,
      person_locations: personLocations,
      organization_locations: [`${config.state}, ${config.country}`],
      organization_num_employees_ranges: [config.companySizeRange],
      q_organization_keyword_tags: config.industries,
      page,
      per_page: config.apolloResultsPerPage,
    });

    const people = response.data?.people || [];
    allPeople = allPeople.concat(people);

    const totalPages = response.data?.pagination?.total_pages || 1;
    if (page >= totalPages) break;
  }

  return allPeople;
}

/**
 * Pulls a phone number for the given person.
 * - If the search result already exposed a number, use it directly.
 * - Otherwise, if phone reveal is configured, requests enrichment and
 *   waits (up to phoneRevealTimeoutMs) for the webhook to deliver it.
 * - Returns null if no number could be obtained either way.
 */
async function resolvePhoneNumber(person) {
  const directNumber = (person.phone_numbers || [])[0]?.raw_number;
  if (directNumber) return directNumber;

  if (!config.phoneRevealWebhookUrl) {
    return null;
  }

  const http = client();
  await http.post('/people/match', {
    id: person.id,
    reveal_phone_number: true,
    webhook_url: config.phoneRevealWebhookUrl,
  });

  return waitForReveal(person.id, config.phoneRevealTimeoutMs);
}

module.exports = { searchPeople, resolvePhoneNumber };
