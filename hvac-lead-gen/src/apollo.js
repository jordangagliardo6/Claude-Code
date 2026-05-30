'use strict';

/**
 * Apollo.io People Search client.
 *
 * Searches the Apollo database for HVAC decision-makers in Southwest Michigan.
 * Phone numbers are returned when Apollo has them; contacts with no phone are
 * filtered out before the results are returned.
 *
 * Apollo REST API docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');
const { TARGET_CITIES, INDUSTRY_KEYWORDS, JOB_TITLES, EMPLOYEE_RANGE } = require('./config');

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// Build a concise phone string from Apollo's phone_numbers array.
// Prefers mobile over direct, direct over work.
function pickBestPhone(phoneNumbers = []) {
  if (!phoneNumbers || phoneNumbers.length === 0) return null;

  const priority = ['mobile', 'direct', 'work', 'other'];
  for (const type of priority) {
    const match = phoneNumbers.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  // Fall back to whatever is first
  return phoneNumbers[0]?.sanitized_number || null;
}

// Extract a clean website URL from an organization object.
function extractWebsite(org = {}) {
  if (org.website_url) return org.website_url;
  if (org.primary_domain) return `https://${org.primary_domain}`;
  return '';
}

// Normalise the city name from a person record.
function extractCity(person) {
  if (person.city) return person.city;
  if (person.organization?.city) return person.organization.city;
  return '';
}

/**
 * Search Apollo for HVAC leads matching our criteria.
 *
 * @param {number} perPage  How many results to request (1–100).
 * @param {number} page     Page number (1-based).
 * @returns {Promise<Array>} Normalised lead objects.
 */
async function searchLeads(perPage = 25, page = 1) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  const payload = {
    per_page: perPage,
    page,
    // Target cities as organisation locations (where the company is based)
    organization_locations: TARGET_CITIES,
    // Keep only owner-operated small businesses
    organization_num_employees_ranges: [EMPLOYEE_RANGE],
    // HVAC / Plumbing / Mechanical industry tags
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    // Decision-maker titles
    person_titles: JOB_TITLES,
    // Request seniority levels that map to owner/exec roles
    person_seniorities: ['owner', 'founder', 'c_suite'],
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE_URL}/mixed_people/search`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      timeout: 30_000,
    });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    throw new Error(`Apollo API request failed: ${msg}`);
  }

  const people = response.data?.people ?? [];
  if (people.length === 0) return [];

  // Normalise and filter out contacts with no phone number
  const leads = [];
  for (const person of people) {
    const phone = pickBestPhone(person.phone_numbers)
      || person.organization?.primary_phone?.sanitized_number
      || null;

    if (!phone) continue; // skip — no phone

    leads.push({
      businessName: person.organization?.name || '',
      firstName: person.first_name || '',
      lastName: person.last_name || '',
      phone,
      city: extractCity(person),
      website: extractWebsite(person.organization),
      apolloId: person.id,
    });
  }

  return leads;
}

/**
 * Fetch up to `maxLeads` leads, paginating if needed, applying dedup against
 * the `existingNames` Set before returning.
 *
 * @param {number}  maxLeads       Hard cap on how many leads to return.
 * @param {Set}     existingNames  Business names already in the sheet (lowercase).
 * @returns {Promise<Array>}
 */
async function fetchNewLeads(maxLeads, existingNames) {
  const results = [];
  let page = 1;

  // We request slightly more than maxLeads per page to account for dedup losses.
  const perPage = Math.min(100, maxLeads * 2);

  while (results.length < maxLeads) {
    const batch = await searchLeads(perPage, page);
    if (batch.length === 0) break;

    for (const lead of batch) {
      if (results.length >= maxLeads) break;
      const key = lead.businessName.toLowerCase().trim();
      if (key && existingNames.has(key)) continue; // duplicate — skip
      results.push(lead);
      existingNames.add(key); // prevent intra-batch dupes too
    }

    // If Apollo returned fewer results than requested, no more pages exist.
    if (batch.length < perPage) break;
    page++;
  }

  return results;
}

module.exports = { fetchNewLeads };
