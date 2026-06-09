const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// Searches Apollo for HVAC decision-makers in Southwest Michigan.
// Returns an array of normalized lead objects ready to write to the sheet.
async function searchLeads(maxResults = config.maxLeadsPerRun) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment variables.');

  logger.info(`Searching Apollo.io for up to ${maxResults} HVAC leads in Southwest Michigan...`);

  // Apollo's mixed_people/search finds people + their company in one call.
  const requestBody = {
    api_key: apiKey,

    // Target job titles in priority order
    person_titles: config.targetTitles,

    // Target cities — Apollo accepts "City, State" strings
    person_locations: config.targetLocations,

    // Industry keyword tags (Apollo fuzzy-matches these to industry categories)
    q_organization_keyword_tags: config.targetIndustries,

    // Company size: owner-operated small businesses only
    organization_num_employees_ranges: [
      `${config.employeeRange.min},${config.employeeRange.max}`,
    ],

    // Only return contacts that have at least one phone number
    contact_phone_status: ['verified', 'likely_to_change'],

    per_page: maxResults,
    page: 1,
  };

  let response;
  try {
    response = await axios.post(
      `${APOLLO_BASE_URL}/mixed_people/search`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
        timeout: 30000,
      }
    );
  } catch (err) {
    const detail = err.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    throw new Error(`Apollo API request failed: ${detail}`);
  }

  const people = response.data?.people || [];
  logger.info(`Apollo returned ${people.length} raw result(s).`);

  // Normalize each person into the shape our sheet expects.
  const leads = [];
  for (const person of people) {
    const phone = extractBestPhone(person.phone_numbers);

    // Skip contacts with no usable phone (belt-and-suspenders; Apollo filter should catch most)
    if (!phone) continue;

    leads.push({
      businessName: person.organization?.name || '',
      firstName: person.first_name || '',
      lastName: person.last_name || '',
      phone,
      city: person.city || extractCityFromLocation(person),
      website: normalizeWebsite(person.organization?.website_url),
    });
  }

  logger.info(`${leads.length} lead(s) have usable phone numbers after filtering.`);
  return leads;
}

// Picks the best phone number from Apollo's phone_numbers array.
// Prefers mobile > direct > work in that order.
function extractBestPhone(phoneNumbers) {
  if (!phoneNumbers || phoneNumbers.length === 0) return null;

  const priority = ['mobile', 'direct', 'work', 'other'];
  for (const type of priority) {
    const match = phoneNumbers.find(
      (p) => p.type === type && p.sanitized_number
    );
    if (match) return match.sanitized_number;
  }

  // Fall back to the first number with any sanitized value
  const fallback = phoneNumbers.find((p) => p.sanitized_number);
  return fallback ? fallback.sanitized_number : null;
}

// Apollo sometimes stores city in nested location fields; this pulls it out.
function extractCityFromLocation(person) {
  if (person.present_raw_address) {
    const parts = person.present_raw_address.split(',');
    return parts[0]?.trim() || '';
  }
  return '';
}

// Ensures the website has a protocol prefix and strips trailing slashes.
function normalizeWebsite(url) {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed.startsWith('http')) return `https://${trimmed}`;
  return trimmed.replace(/\/$/, '');
}

module.exports = { searchLeads };
