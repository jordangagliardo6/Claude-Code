/**
 * apollo.js — Searches Apollo.io for HVAC decision-makers in SW Michigan.
 *
 * Uses the Apollo REST API directly with APOLLO_API_KEY.
 * Requires a paid Apollo plan (Basic or above) for People Search.
 * Free plans will receive a 403 — the error message will tell you exactly what to do.
 */
const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

/**
 * Searches Apollo for HVAC owner/decision-maker contacts.
 * Returns an array of lead objects shaped for the Google Sheet.
 *
 * @param {number} limit  Max results to return (default: MAX_LEADS_PER_RUN)
 */
async function searchHvacLeads(limit = config.MAX_LEADS_PER_RUN) {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }

  console.log('[Apollo] Searching for HVAC leads in Southwest Michigan...');

  // Build a person_locations array — one entry per city
  const personLocations = config.TARGET_CITIES;

  const payload = {
    api_key: process.env.APOLLO_API_KEY,
    // Target job titles (exact match — no fuzzy)
    person_titles: config.TARGET_TITLES,
    include_similar_titles: false,
    // Where the person is physically located
    person_locations: personLocations,
    // Company HQ also in Michigan (belt-and-suspenders)
    organization_locations: ['Michigan, United States'],
    // Industry filter via keyword tags
    q_organization_keyword_tags: config.INDUSTRY_KEYWORDS,
    // 1–25 employees only
    organization_num_employees_ranges: [config.EMPLOYEE_RANGE],
    // Only return contacts with a phone number
    contact_email_status: ['verified', 'unverified'],
    per_page: Math.min(limit, 100),
    page: 1,
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;

    if (status === 403 || status === 402) {
      throw new Error(
        `Apollo API access denied (${status}). ` +
        'The People Search endpoint requires a Basic plan or above. ' +
        `Detail: ${detail}`
      );
    }
    throw new Error(`Apollo API request failed: ${detail}`);
  }

  const people = response.data?.people || [];
  console.log(`[Apollo] Found ${people.length} raw results.`);

  // Reshape into sheet-ready rows and filter out contacts with no phone
  const leads = [];
  for (const person of people) {
    const phone = pickPhone(person);
    if (!phone) continue; // skip — no usable phone number

    leads.push({
      dateAdded: today(),
      businessName: person.organization?.name || '',
      ownerFirstName: person.first_name || '',
      ownerLastName: person.last_name || '',
      phone,
      city: extractCity(person),
      website: person.organization?.website_url || '',
    });

    if (leads.length >= limit) break;
  }

  console.log(`[Apollo] ${leads.length} leads with phone numbers.`);
  return leads;
}

// Prefer mobile, then direct dial, then any phone
function pickPhone(person) {
  if (person.sanitized_phone) return person.sanitized_phone;
  if (person.mobile_phone) return person.mobile_phone;
  if (person.organization?.sanitized_phone) return person.organization.sanitized_phone;
  return null;
}

function extractCity(person) {
  // city may be on the person or on their org
  const raw = person.city || person.organization?.city || '';
  // Strip state suffix if present (e.g. "Kalamazoo, MI" → "Kalamazoo")
  return raw.split(',')[0].trim();
}

function today() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

module.exports = { searchHvacLeads };
