/**
 * Apollo.io API client for HVAC lead prospecting.
 *
 * IMPORTANT: The people search endpoint (/mixed_people/api_search) requires
 * a PAID Apollo plan (Basic, Professional, or Organization).
 * Free plans will receive an authorization error.
 * Upgrade at: https://www.apollo.io/pricing
 */

const axios = require('axios');
const config = require('./config');

const apolloClient = axios.create({
  baseURL: config.apollo.baseUrl,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': config.apollo.apiKey,
  },
  timeout: 30000,
});

/**
 * Search for HVAC decision-makers in Southwest Michigan.
 * Returns an array of enriched lead objects.
 *
 * Uses Apollo's mixed_people/api_search endpoint — requires a paid plan.
 */
async function searchHvacLeads() {
  if (!config.apollo.apiKey) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }

  const allLeads = [];
  let page = 1;
  const perPage = 25;

  // Search with each title in priority order, stopping once we have enough leads
  for (const title of config.apollo.targetTitles) {
    if (allLeads.length >= config.apollo.maxLeadsPerRun) break;

    const remaining = config.apollo.maxLeadsPerRun - allLeads.length;
    const pageSize = Math.min(perPage, remaining);

    console.log(`  Searching for "${title}" (need ${remaining} more leads)...`);

    try {
      const response = await apolloClient.post('/mixed_people/api_search', {
        person_titles: [title],
        include_similar_titles: false,
        person_locations: config.apollo.targetCities,
        organization_locations: ['Michigan, United States'],
        q_organization_keyword_tags: config.apollo.industryKeywords,
        organization_num_employees_ranges: config.apollo.employeeRanges,
        per_page: pageSize,
        page: page,
      });

      const people = response.data?.people || [];

      for (const person of people) {
        if (allLeads.length >= config.apollo.maxLeadsPerRun) break;

        // Skip anyone without a phone number — enrichment call below will check
        const lead = await enrichPersonPhone(person);
        if (lead) {
          allLeads.push(lead);
        }
      }
    } catch (err) {
      // 403 = plan restriction, surface a clear message
      if (err.response?.status === 403 || err.response?.data?.error_code === 'API_INACCESSIBLE') {
        throw new Error(
          'Apollo plan upgrade required.\n' +
          'The People Search API (/mixed_people/api_search) requires a paid Apollo plan.\n' +
          'Current plan: Free. Upgrade at https://www.apollo.io/pricing\n' +
          'Original error: ' + (err.response?.data?.error || err.message)
        );
      }
      // Rate limit — log and continue to next title
      if (err.response?.status === 429) {
        console.warn(`  Rate limited by Apollo on title "${title}". Waiting 10s...`);
        await sleep(10000);
        continue;
      }
      throw err;
    }
  }

  return allLeads;
}

/**
 * Enrich a person record to get their phone number.
 * Returns a structured lead object, or null if no phone was found.
 */
async function enrichPersonPhone(person) {
  try {
    const response = await apolloClient.post('/people/bulk_match', {
      details: [{ id: person.id }],
      reveal_phone_number: true,
    });

    const matched = response.data?.people?.[0];
    if (!matched) return null;

    const phone = extractPhone(matched);
    if (!phone) return null; // skip contacts with no phone

    return {
      firstName: matched.first_name || '',
      lastName:  masked(matched.last_name) ? '' : (matched.last_name || ''),
      company:   matched.organization?.name || matched.employment_history?.[0]?.organization_name || '',
      phone:     phone,
      city:      extractCity(matched),
      website:   matched.organization?.website_url || matched.organization?.primary_domain || '',
    };
  } catch (err) {
    // Enrichment failure on a single record shouldn't stop the whole run
    console.warn(`  Enrichment skipped for person ${person.id}: ${err.message}`);
    return null;
  }
}

/**
 * Extract the best available phone number from an enriched person record.
 */
function extractPhone(person) {
  // Prefer mobile/direct dial, fall back to organization phone
  if (person.mobile_phone) return formatPhone(person.mobile_phone);
  if (person.direct_dial_phone) return formatPhone(person.direct_dial_phone);
  if (person.phone_numbers?.length) {
    const direct = person.phone_numbers.find(p => p.type === 'direct_dial' || p.type === 'mobile');
    if (direct) return formatPhone(direct.raw_number || direct.sanitized_number);
    return formatPhone(person.phone_numbers[0].raw_number || person.phone_numbers[0].sanitized_number);
  }
  if (person.organization?.phone) return formatPhone(person.organization.phone);
  return null;
}

/**
 * Extract the person's city from their location fields.
 */
function extractCity(person) {
  if (person.city) return person.city;
  if (person.location) {
    const parts = person.location.split(',');
    return parts[0].trim();
  }
  return '';
}

/**
 * Check if a value looks like an Apollo-masked field (e.g. "S***h").
 */
function masked(value) {
  return typeof value === 'string' && value.includes('*');
}

function formatPhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  }
  return raw;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchHvacLeads };
