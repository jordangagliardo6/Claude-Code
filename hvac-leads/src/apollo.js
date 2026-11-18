const axios = require('axios');
const { config } = require('./config');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// Searches Apollo for people (owners/decision-makers) at HVAC companies
// in the target cities. Returns an array of normalized lead objects.
async function searchHVACLeads(maxResults = 25) {
  const leads = [];
  let page = 1;
  const perPage = Math.min(maxResults, 25); // Apollo max per_page is 25

  while (leads.length < maxResults) {
    const remaining = maxResults - leads.length;
    const pageSize = Math.min(perPage, remaining);

    const payload = {
      api_key: config.apolloApiKey,

      // Target job titles in priority order
      person_titles: config.targetJobTitles,

      // Location: combine all target cities
      person_locations: config.targetCities,

      // Industry keywords
      q_organization_keyword_tags: config.targetIndustries,

      // Employee count range: "1,25" means 1 to 25 employees
      organization_num_employees_ranges: [config.employeeRange],

      // Only return contacts that have a phone number
      contact_phone_status: ['available', 'unavailable'],

      per_page: pageSize,
      page,
    };

    let response;
    try {
      response = await axios.post(`${APOLLO_BASE_URL}/mixed_people/search`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.error || err.message;
      throw new Error(`Apollo API error (HTTP ${status || 'unknown'}): ${detail}`);
    }

    const people = response.data?.people || [];
    if (people.length === 0) break; // No more results

    for (const person of people) {
      const phone = extractPhone(person);
      if (!phone) continue; // Skip contacts with no phone

      leads.push(normalizeLead(person, phone));
      if (leads.length >= maxResults) break;
    }

    // Apollo pagination: stop if we got fewer results than requested
    if (people.length < pageSize) break;
    page++;
  }

  return leads;
}

// Picks the best available phone number from a contact record
function extractPhone(person) {
  // Prefer direct/mobile over work phone
  const candidates = [
    person.mobile_phone,
    person.direct_dial_phone,
    person.phone_numbers?.[0]?.sanitized_number,
    person.organization?.phone,
  ];
  return candidates.find(Boolean) || null;
}

// Maps an Apollo person object to a flat lead record
function normalizeLead(person, phone) {
  const org = person.organization || {};
  const city = extractCity(person);

  return {
    businessName: org.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone,
    city,
    website: org.website_url || '',
  };
}

// Extracts a clean city name from location strings
function extractCity(person) {
  const raw =
    person.city ||
    person.present_raw_address ||
    person.organization?.city ||
    '';
  // Strip state/country suffixes if present
  return raw.split(',')[0].trim();
}

module.exports = { searchHVACLeads };
