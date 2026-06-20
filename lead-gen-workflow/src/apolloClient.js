// apolloClient.js
//
// Thin wrapper around the Apollo.io REST API. Two calls are involved:
//
//   1. POST /mixed_people/search -- finds people matching our title /
//      industry / company-size / location filters. This call does NOT
//      return phone numbers (Apollo never includes them in search results).
//
//   2. POST /people/match with reveal_phone_number=true -- enriches a
//      single person and reveals their direct/mobile number. Phone reveal
//      is asynchronous on Apollo's side: the number is often not present
//      on the first response, so we poll the same endpoint a few times
//      with a short delay before giving up on that lead.
//
// Auth is via the APOLLO_API_KEY environment variable (sent as the
// X-Api-Key header), per the task requirement to use API-key auth rather
// than the interactive OAuth app.

const axios = require('axios');
const config = require('../config');
const logger = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

function apolloHeaders() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY is not set in the environment.');
  }
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Api-Key': apiKey,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Searches one city for people matching our job-title / industry /
// company-size filters. Returns Apollo's raw "people" array, each person
// carrying its embedded organization object.
async function searchCity(city, state) {
  const body = {
    person_titles: config.jobTitlePriority,
    organization_locations: [`${city}, ${state}, US`],
    organization_num_employees_ranges: [config.employeeRange],
    q_organization_keyword_tags: config.industryKeywords,
    per_page: 25,
    page: 1,
  };

  const { data } = await axios.post(`${APOLLO_BASE_URL}/mixed_people/search`, body, {
    headers: apolloHeaders(),
  });

  return data.people || [];
}

// Runs searchCity for every configured city and returns the combined list,
// tagging each person with the city we searched for (useful since Apollo's
// own location fields are sometimes the metro area, not the exact town).
async function searchLeads() {
  const allPeople = [];

  for (const { city, state } of config.targetCities) {
    try {
      const people = await searchCity(city, state);
      logger.info(`Apollo search "${city}, ${state}" -> ${people.length} people`);
      allPeople.push(...people.map((p) => ({ ...p, _searchCity: city })));
    } catch (err) {
      const detail = err.response ? `${err.response.status} ${JSON.stringify(err.response.data)}` : err.message;
      logger.error(`Apollo search failed for "${city}, ${state}": ${detail}`);
    }
  }

  return allPeople;
}

// Pulls the phone number out of whichever field Apollo populated.
function extractPhone(person) {
  if (!person) return null;
  if (person.mobile_phone) return person.mobile_phone;
  if (person.sanitized_phone) return person.sanitized_phone;
  if (Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0) {
    const first = person.phone_numbers[0];
    return first.sanitized_number || first.raw_number || null;
  }
  return null;
}

// Reveals a direct/mobile number for one person, polling because the
// reveal happens asynchronously. Returns the phone string, or null if none
// could be found within phoneEnrichMaxAttempts tries.
async function enrichPhoneNumber(person) {
  const body = { id: person.id, reveal_phone_number: true };

  for (let attempt = 1; attempt <= config.phoneEnrichMaxAttempts; attempt++) {
    try {
      const { data } = await axios.post(`${APOLLO_BASE_URL}/people/match`, body, {
        headers: apolloHeaders(),
      });
      const phone = extractPhone(data.person);
      if (phone) return phone;
    } catch (err) {
      const detail = err.response ? `${err.response.status} ${JSON.stringify(err.response.data)}` : err.message;
      logger.error(`Apollo phone enrichment failed for "${person.name}": ${detail}`);
      return null;
    }

    if (attempt < config.phoneEnrichMaxAttempts) {
      await sleep(config.phoneEnrichPollDelayMs);
    }
  }

  return null;
}

module.exports = { searchLeads, enrichPhoneNumber, extractPhone };
