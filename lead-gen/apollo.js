const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// Customize these arrays to change search scope
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

const INDUSTRY_KEYWORDS =
  'HVAC heating air conditioning plumbing mechanical contractor';

async function searchPeople(apiKey, page = 1, perPage = 25) {
  const response = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/api_search`,
    {
      page,
      per_page: perPage,
      person_titles: TARGET_TITLES,
      person_seniorities: ['owner', 'c_suite', 'founder'],
      person_locations: SW_MICHIGAN_CITIES,
      organization_locations: ['Michigan, United States'],
      // 1-25 employees = owner-operated small businesses
      organization_num_employees_ranges: ['1,10', '11,25'],
      q_keywords: INDUSTRY_KEYWORDS,
      include_similar_titles: true,
    },
    {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
}

async function enrichPeople(apiKey, personIds) {
  const BATCH_SIZE = 10; // Apollo bulk_match limit
  const results = [];

  for (let i = 0; i < personIds.length; i += BATCH_SIZE) {
    const batch = personIds.slice(i, i + BATCH_SIZE);
    const response = await axios.post(
      `${APOLLO_BASE_URL}/people/bulk_match`,
      {
        details: batch.map(id => ({ id })),
        reveal_personal_emails: false,
        reveal_phone_number: true,
      },
      {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );
    if (response.data?.matches) {
      results.push(...response.data.matches);
    }
  }

  return results;
}

function extractLeadData(person) {
  // Prefer mobile > direct > any phone
  const phone =
    person.mobile_phone ||
    person.sanitized_phone ||
    person.phone_numbers?.find(p => p.type === 'mobile')?.sanitized_number ||
    person.phone_numbers?.[0]?.sanitized_number ||
    null;

  if (!phone) return null;

  const org = person.organization || person.account || {};

  return {
    businessName: org.name || person.organization_name || '',
    ownerFirstName: person.first_name || '',
    ownerLastName: person.last_name || '',
    phoneNumber: phone,
    city: person.city || org.city || '',
    website: org.website_url || '',
  };
}

module.exports = { searchPeople, enrichPeople, extractLeadData, SW_MICHIGAN_CITIES, TARGET_TITLES };
