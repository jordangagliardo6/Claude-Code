'use strict';
const axios = require('axios');
const { INDUSTRIES, JOB_TITLES, STATE, EMPLOYEE_RANGE, CITY_NAMES } = require('./config');

const client = axios.create({
  baseURL: 'https://api.apollo.io/api/v1',
  headers: {
    'X-Api-Key': process.env.APOLLO_API_KEY,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  },
  timeout: 30000,
});

// Searches Apollo for decision-makers at small HVAC/plumbing companies in SW Michigan.
// Returns an array of raw Apollo person objects.
// NOTE: This endpoint requires an Apollo paid plan (Basic $49/mo or higher).
// On a Free plan you will get an API_INACCESSIBLE error. Upgrade at apollo.io/pricing.
async function searchPeople(perPage = 50, page = 1) {
  let response;
  try {
    response = await client.post('/mixed_people/search', {
      per_page: perPage,
      page,
      // Decision-maker titles — in priority order (Owner first, GM last)
      person_titles: JOB_TITLES,
      person_seniorities: ['owner', 'founder', 'c_suite'],
      include_similar_titles: true,
      // Company filters
      organization_locations: [STATE],
      organization_num_employees_ranges: [EMPLOYEE_RANGE],
      // Industry keywords — Apollo matches these against company tags
      q_organization_keyword_tags: INDUSTRIES,
      // Bias results toward SW Michigan cities via keyword search
      q_keywords: CITY_NAMES.join(' '),
    });
  } catch (err) {
    const code = err.response?.data?.error_code;
    if (code === 'API_INACCESSIBLE') {
      throw new Error(
        'Apollo API plan required: The People Search endpoint is not available on the Free plan.\n' +
        'Upgrade to a paid Apollo plan at https://www.apollo.io/pricing (Basic is $49/mo).\n' +
        'Your current credits (lead credits, direct-dial credits) will carry over after upgrading.'
      );
    }
    throw err;
  }
  return response.data.people || [];
}

// Enriches a batch of Apollo people by ID to reveal phone numbers.
// Uses direct-dial credits from your Apollo account (1 credit per new reveal).
// Returns an array of enriched person objects.
async function enrichPeople(personIds) {
  if (!personIds || personIds.length === 0) return [];
  const response = await client.post('/people/bulk_match', {
    reveal_phone_number: true,
    details: personIds.map(id => ({ id })),
  });
  return response.data.matches || [];
}

// Returns the best available phone number from a person object.
// Priority: mobile > direct dial > any other number.
function extractBestPhone(person) {
  const phones = person.phone_numbers || [];
  for (const type of ['mobile_phone', 'direct_phone']) {
    const match = phones.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }
  const any = phones.find(p => p.sanitized_number);
  return any ? any.sanitized_number : null;
}

// Extracts a clean city name from a person or their organization.
function extractCity(person) {
  if (person.city) return person.city;
  const org = person.organization || {};
  return org.city || '';
}

// Normalizes a raw Apollo person into the lead shape the rest of the app uses.
// Returns null if the contact has no phone number (exclude these).
function normalizePerson(person) {
  const phone = extractBestPhone(person);
  if (!phone) return null;

  const org = person.organization || {};
  const businessName = (org.name || '').trim();
  if (!businessName) return null;

  const website = org.website_url
    || (org.primary_domain ? `https://${org.primary_domain}` : '');

  return {
    businessName,
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone,
    city: extractCity(person),
    website,
    // Keep raw state info for city filtering
    _state: person.state || org.state || '',
    _id: person.id,
  };
}

module.exports = { searchPeople, enrichPeople, normalizePerson, extractCity };
