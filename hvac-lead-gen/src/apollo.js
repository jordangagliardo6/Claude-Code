const axios = require('axios');
const config = require('./config');
const log = require('./logger');

const client = axios.create({
  baseURL: config.apollo.baseUrl,
  headers: {
    'X-Api-Key': config.apollo.apiKey,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  },
  timeout: 30000,
});

/**
 * Search Apollo for HVAC decision-makers in Southwest Michigan.
 *
 * Returns an array of normalized lead objects ready for the spreadsheet.
 * People without a phone number are silently skipped per user requirements.
 */
async function searchLeads() {
  log.info('Querying Apollo.io for HVAC leads in SW Michigan...');

  const payload = {
    // Industry targeting via keyword tags and SIC code.
    q_organization_keyword_tags: config.apollo.targetIndustryKeywords,
    organization_sic_codes: config.apollo.targetSicCodes,

    // Company size: 1–25 employees only.
    organization_num_employees_ranges: config.apollo.employeeRanges,

    // SW Michigan city locations for the company HQ.
    organization_locations: config.apollo.targetCities,

    // Decision-maker titles in priority order.
    person_titles: config.apollo.targetTitles,

    // Pull enough per page to get 25 usable leads after phone filtering.
    per_page: 50,
    page: 1,
  };

  let response;
  try {
    response = await client.post('/mixed_people/search', payload);
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Apollo API request failed: ${detail}`);
  }

  const people = response.data?.people || [];
  log.info(`Apollo returned ${people.length} candidate contacts.`);

  const leads = [];

  for (const person of people) {
    if (leads.length >= config.apollo.maxLeadsPerRun) break;

    const phone = pickBestPhone(person.phone_numbers);
    if (!phone) continue; // user requirement: skip contacts with no phone

    const org = person.organization || {};

    leads.push({
      businessName:  org.name                    || '',
      firstName:     person.first_name            || '',
      lastName:      person.last_name             || '',
      phone,
      city:          extractCity(person, org),
      website:       org.website_url              || '',
    });
  }

  log.info(`${leads.length} leads with phone numbers extracted from Apollo results.`);
  return leads;
}

// Prefer mobile > direct_phone > work > any available.
function pickBestPhone(phoneNumbers) {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) return null;

  const priority = ['mobile', 'direct_phone', 'work'];
  for (const type of priority) {
    const match = phoneNumbers.find((p) => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }

  // Fall back to any number present.
  const fallback = phoneNumbers.find((p) => p.sanitized_number || p.raw_number);
  return fallback ? (fallback.sanitized_number || fallback.raw_number) : null;
}

// Apollo can return city info on the person or on the org — try both.
function extractCity(person, org) {
  if (person.city) return person.city;
  if (org.city)    return org.city;

  // Parse it out of the location string when available.
  const loc = person.location || org.raw_address || '';
  const parts = loc.split(',');
  return parts[0]?.trim() || '';
}

module.exports = { searchLeads };
