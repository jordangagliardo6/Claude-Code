'use strict';

const axios  = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// Pick the best phone from Apollo's phone_numbers array.
// Priority: mobile → direct → corporate → first available
function extractBestPhone(phoneNumbers) {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) return null;

  const validPhones = phoneNumbers.filter(p => p.sanitized_number || p.raw_number);
  if (validPhones.length === 0) return null;

  const PRIORITY = ['mobile', 'direct', 'corporate'];
  for (const type of PRIORITY) {
    const match = validPhones.find(p => p.type === type);
    if (match) return match.sanitized_number || match.raw_number;
  }

  return validPhones[0].sanitized_number || validPhones[0].raw_number;
}

// Map one Apollo person object → our internal lead shape.
// Returns null if the contact has no usable phone number.
function mapPersonToLead(person) {
  const phone = extractBestPhone(person.phone_numbers);
  if (!phone) return null; // caller filters these out

  const org   = person.organization || {};
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });

  return {
    dateAdded:    today,
    businessName: org.name          || '',
    firstName:    person.first_name  || '',
    lastName:     person.last_name   || '',
    phone,
    city:         person.city || org.city || '',
    website:      org.website_url    || '',
  };
}

// Search Apollo.io for HVAC owner contacts in Southwest Michigan.
// Returns an array of lead objects (no nulls — contacts without phone are dropped).
async function searchApolloLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set');

  // Build "City, State, Country" strings for each target city
  const locations = config.CITIES.map(
    city => `${city}, ${config.STATE}, ${config.COUNTRY}`
  );

  const payload = {
    api_key: apiKey,
    person_titles:                    config.JOB_TITLES,
    person_locations:                 locations,
    organization_industries:          config.INDUSTRIES,
    // Apollo accepts "min,max" strings; using a loose upper bound and filtering below
    organization_num_employees_ranges: [`${config.MIN_EMPLOYEES},${config.MAX_EMPLOYEES}`],
    per_page: config.MAX_LEADS_PER_RUN,
    page:     1,
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    });
  } catch (err) {
    // Surface the Apollo error message when available
    const detail = err.response?.data?.error || err.response?.data?.message || err.message;
    throw new Error(`Apollo API request failed: ${detail}`);
  }

  const people = response.data?.people;
  if (!Array.isArray(people)) {
    throw new Error(`Unexpected Apollo response shape: ${JSON.stringify(response.data).slice(0, 200)}`);
  }

  console.log(`Apollo returned ${people.length} raw result(s)`);

  return people
    .map(mapPersonToLead)
    .filter(Boolean); // drop contacts with no phone
}

module.exports = { searchApolloLeads };
