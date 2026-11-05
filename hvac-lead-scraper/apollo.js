/**
 * apollo.js – Apollo.io API client.
 * Searches for HVAC decision-makers in Southwest Michigan and returns
 * clean lead objects ready to be written to Google Sheets.
 */
const axios = require('axios');
const config = require('./config');

const { apollo: cfg } = config;

/**
 * Returns the best available phone number from Apollo's phone_numbers array.
 * Preference: mobile > work_direct > work_hq > any other type.
 */
function pickBestPhone(phoneNumbers = []) {
  if (!phoneNumbers.length) return '';

  const priority = ['mobile', 'work_direct', 'work_hq'];
  for (const type of priority) {
    const match = phoneNumbers.find((p) => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }

  // Fall back to whatever is listed first
  return phoneNumbers[0].sanitized_number || phoneNumbers[0].raw_number || '';
}

/**
 * Builds the Apollo People Search request body.
 * Edit `q_keywords` or swap in `organization_industry_tag_ids` if you know
 * your Apollo account's exact HVAC industry tag IDs.
 */
function buildSearchPayload(page = 1) {
  const keywordQuery = cfg.industryTerms
    .map((t) => (t.includes(' ') ? `"${t}"` : t))
    .join(' OR ');

  return {
    per_page: cfg.maxLeadsPerRun,
    page,
    // Job title filter
    person_titles: cfg.personTitles,
    // Company location
    organization_locations: cfg.organizationLocations,
    // Company size
    organization_num_employees_ranges: cfg.employeeRanges,
    // Keyword search covers industry name, company description, and tags
    q_keywords: keywordQuery,
    // Only return contacts that have a phone number on file
    contact_phone_number_exists: true,
  };
}

/**
 * Maps a raw Apollo person object to a simplified lead object.
 */
function mapPerson(person) {
  const city =
    person.city ||
    (person.organization && person.organization.city) ||
    '';
  const website =
    (person.organization && person.organization.website_url) ||
    person.website_url ||
    '';
  const companyName =
    person.organization_name ||
    (person.organization && person.organization.name) ||
    '';

  return {
    businessName: companyName,
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: pickBestPhone(person.phone_numbers),
    city: city,
    website: website,
  };
}

/**
 * Checks whether a lead's city is in (or near) the target Southwest Michigan cities.
 * Returns true if the city matches one of the configured target cities, or if no
 * city data is available (we keep it rather than discard a valid HVAC contact).
 */
function isTargetCity(lead) {
  if (!lead.city) return true; // keep when city is unknown
  const lowerCity = lead.city.toLowerCase();
  return cfg.targetCities.some((c) => lowerCity.includes(c.toLowerCase()));
}

/**
 * Fetches up to `maxLeadsPerRun` HVAC leads from Apollo.io.
 * Returns an array of lead objects; throws on API errors.
 */
async function fetchHVACLeads() {
  if (!cfg.apiKey) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }

  const url = `${cfg.baseUrl}/mixed_people/search`;
  const payload = buildSearchPayload(1);

  let response;
  try {
    response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    });
  } catch (err) {
    const status = err.response ? err.response.status : 'network';
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Apollo API request failed (HTTP ${status}): ${detail}`);
  }

  const people = response.data.people || [];

  if (people.length === 0) {
    console.log('[Apollo] Search returned 0 contacts for the given filters.');
    return [];
  }

  console.log(`[Apollo] Raw results: ${people.length} contacts`);

  // Map to clean lead objects and filter out contacts with no phone
  const leads = people
    .map(mapPerson)
    .filter((l) => l.phone)       // must have a phone number
    .filter((l) => l.businessName); // must have a company name

  // Soft-filter to SW Michigan cities (keeps unknown cities)
  const targeted = leads.filter(isTargetCity);
  console.log(`[Apollo] After city filter: ${targeted.length} leads`);

  return targeted;
}

module.exports = { fetchHVACLeads };
