/**
 * Apollo.io API client for searching HVAC leads in Southwest Michigan.
 * API docs: https://apolloio.github.io/apollo-api-docs/
 */

const axios = require('axios');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// Southwest Michigan cities and their surrounding zip codes
const SW_MICHIGAN_LOCATIONS = [
  { city: 'St. Joseph',   state: 'Michigan' },
  { city: 'Benton Harbor', state: 'Michigan' },
  { city: 'Kalamazoo',    state: 'Michigan' },
  { city: 'Holland',      state: 'Michigan' },
  { city: 'Grand Haven',  state: 'Michigan' },
  { city: 'Muskegon',     state: 'Michigan' },
  { city: 'South Haven',  state: 'Michigan' },
];

// Apollo keyword/industry values for HVAC-related industries
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Heating, Ventilation & Air Conditioning',
];

// Job titles in priority order (Owner first, then alternates)
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

/**
 * Search Apollo for HVAC contacts matching our criteria.
 * Returns up to `maxResults` contacts with phone numbers.
 *
 * @param {string} apiKey
 * @param {number} maxResults
 * @returns {Promise<Array>} normalized lead objects
 */
async function searchHvacLeads(apiKey, maxResults = 25) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': apiKey,
  };

  const allLeads = [];
  const seenCompanies = new Set();

  // Iterate over cities so we get geographic spread
  for (const location of SW_MICHIGAN_LOCATIONS) {
    if (allLeads.length >= maxResults) break;

    const remaining = maxResults - allLeads.length;
    const pageSize = Math.min(remaining + 10, 25); // fetch a few extra to allow deduplication

    const payload = {
      // Person-level search
      person_titles: TARGET_TITLES,
      contact_email_status: [], // accept any email status
      organization_industry_tag_values: TARGET_INDUSTRIES,

      // Location filters
      person_locations: [`${location.city}, Michigan, United States`],

      // Company size: 1–25 employees
      organization_num_employees_ranges: ['1,25'],

      // Only contacts that have a phone number
      has_phone: true,

      // Pagination
      page: 1,
      per_page: pageSize,
    };

    try {
      console.log(`  Searching Apollo for ${location.city}, MI...`);
      const response = await axios.post(
        `${APOLLO_BASE_URL}/mixed_people/search`,
        payload,
        { headers, timeout: 30000 }
      );

      const contacts = response.data?.people ?? [];
      console.log(`    Found ${contacts.length} contacts in ${location.city}`);

      for (const contact of contacts) {
        if (allLeads.length >= maxResults) break;

        const companyName = extractCompanyName(contact);
        if (!companyName || seenCompanies.has(companyName.toLowerCase())) continue;

        const phone = extractBestPhone(contact);
        if (!phone) continue; // skip if truly no phone despite filter

        seenCompanies.add(companyName.toLowerCase());
        allLeads.push(normalizeContact(contact, location.city, phone, companyName));
      }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message ?? err.message;
      console.error(`  Apollo error for ${location.city}: HTTP ${status} — ${msg}`);
      // Don't rethrow — try next city
    }

    // Apollo rate limit: ~1 req/sec on free tier
    await sleep(1200);
  }

  return allLeads;
}

// --- helpers ---

function extractCompanyName(contact) {
  return (
    contact.organization?.name ??
    contact.employment_history?.[0]?.organization_name ??
    null
  );
}

function extractBestPhone(contact) {
  // Apollo returns phones at contact.phone_numbers[] or contact.phone_number
  const phones = contact.phone_numbers ?? [];
  // Prefer mobile or direct lines
  const mobileOrDirect = phones.find(
    (p) => p.type === 'mobile' || p.type === 'direct'
  );
  if (mobileOrDirect) return mobileOrDirect.sanitized_number ?? mobileOrDirect.raw_number;

  if (phones.length > 0) return phones[0].sanitized_number ?? phones[0].raw_number;

  // Fall back to top-level field (older API versions)
  return contact.phone_number ?? null;
}

function extractWebsite(contact) {
  return (
    contact.organization?.website_url ??
    contact.organization?.primary_domain ??
    null
  );
}

function normalizeContact(contact, city, phone, companyName) {
  return {
    businessName: companyName,
    firstName: contact.first_name ?? '',
    lastName: contact.last_name ?? '',
    phone,
    city,
    website: extractWebsite(contact) ?? '',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { searchHvacLeads };
