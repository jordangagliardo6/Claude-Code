// ============================================================
// Apollo.io API Client
// Searches for HVAC decision-makers in Southwest Michigan.
// Docs: https://apolloio.github.io/apollo-api-docs/
// ============================================================

require('dotenv').config();
const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// Picks the best available phone number from a contact.
// Priority: mobile → direct → other personal → skip.
function pickPhone(person) {
  const phones = person.phone_numbers || [];

  const priority = ['mobile', 'direct_dial', 'direct', 'work_direct'];
  for (const type of priority) {
    const match = phones.find(p => p.sanitized_number && p.type === type);
    if (match) return match.sanitized_number;
  }

  // Fall back to any number that exists on the person record
  const any = phones.find(p => p.sanitized_number);
  if (any) return any.sanitized_number;

  // Last resort: organization primary phone (a business line, not ideal)
  const org = person.organization || {};
  if (org.primary_phone && org.primary_phone.sanitized_number) {
    return org.primary_phone.sanitized_number;
  }

  return null;
}

// Normalizes the raw Apollo person object into our lead schema.
function normalizePerson(person) {
  const org = person.organization || {};

  const phone = pickPhone(person);
  if (!phone) return null;   // skip contacts with no usable number

  // Prefer the org's city; fall back to the person's own city field.
  const city = org.city || person.city || '';

  // Only keep leads in our target cities (case-insensitive partial match).
  const inTargetCity = config.targetCities.some(
    target => city.toLowerCase().includes(target.toLowerCase())
  );
  if (!inTargetCity) return null;

  return {
    businessName: (org.name || '').trim(),
    firstName:    (person.first_name || '').trim(),
    lastName:     (person.last_name  || '').trim(),
    phone:        phone,
    city:         city,
    website:      (org.website_url || '').trim(),
  };
}

// Searches Apollo.io for HVAC leads and returns normalized lead objects.
// maxResults: cap on how many raw results to request from Apollo.
async function searchHvacLeads(maxResults = 50) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY is not set in the .env file.');
  }

  const body = {
    api_key: apiKey,
    page: 1,
    per_page: Math.min(maxResults, 100),   // Apollo max per_page is 100

    // Job title filter — matched against current title at the organization.
    person_titles: config.jobTitles,

    // Location filter — narrows to organizations in Michigan.
    organization_locations: [config.apolloLocationFilter],

    // Company size filter — 1–25 employees (owner-operated businesses).
    organization_num_employees_ranges: [config.employeeRange],
  };

  // If industry tag IDs are configured, add them.
  // Leave config.industryTagIds = [] to skip this filter.
  if (config.industryTagIds.length > 0) {
    body.organization_industry_tag_ids = config.industryTagIds;
  }

  // Keyword filter — helps Apollo surface HVAC/plumbing companies.
  // This adds relevance scoring but is not a strict filter.
  if (config.industryKeywords.length > 0) {
    body.q_keywords = config.industryKeywords.join(' ');
  }

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
  } catch (err) {
    const status  = err.response?.status;
    const message = err.response?.data?.message || err.message;
    throw new Error(`Apollo API error (${status}): ${message}`);
  }

  const people = response.data?.people || [];
  if (people.length === 0) {
    return [];
  }

  // Normalize and filter — removes contacts without phones or outside target cities.
  const leads = people
    .map(normalizePerson)
    .filter(Boolean);

  return leads;
}

module.exports = { searchHvacLeads };
