/**
 * apolloSearch.js
 *
 * Searches Apollo.io for HVAC company decision-makers in Southwest Michigan,
 * then enriches each result with a direct phone number.
 *
 * Apollo REST API docs: https://apolloio.github.io/apollo-api-docs/
 * Required plan: Professional or above (People API Search + Direct Dial reveal).
 */

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// ─── EDIT THESE to change target geography or industries ───────────────────

// Cities/areas to target (matched against company headquarters location)
const TARGET_LOCATIONS = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Industries — NAICS codes for HVAC/Plumbing/Mechanical contractors
// 238220 = Plumbing, Heating, and Air-Conditioning Contractors
// 238210 = Electrical Contractors (excluded below, but nearby codes included)
// 238290 = Other Building Equipment Contractors
const NAICS_CODES = ['238220', '238290'];

// Decision-maker titles to target, in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ─── END EDITABLE SECTION ───────────────────────────────────────────────────

const apolloClient = axios.create({
  baseURL: APOLLO_BASE,
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': process.env.APOLLO_API_KEY,
  },
  timeout: 30000,
});

/**
 * Searches Apollo for HVAC contacts and enriches them with phone numbers.
 * Returns an array of lead objects ready to write to Google Sheets.
 *
 * @param {number} limit  Max number of new leads to return (default 25)
 */
async function searchHVACLeads(limit = 25) {
  if (!process.env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set in environment variables.');
  }

  // Step 1 — Search for people
  const searchPayload = {
    per_page: limit,
    page: 1,
    person_titles: TARGET_TITLES,
    include_similar_titles: false,
    organization_locations: TARGET_LOCATIONS,
    organization_naics_codes: NAICS_CODES,
    // 1–25 employees = owner-operated small businesses
    organization_num_employees_ranges: ['1,10', '11,25'],
    // Exclude contacts with no phone (improves enrichment hit rate)
    contact_email_status: undefined, // not filtering by email
  };

  console.log('Searching Apollo for HVAC contacts in SW Michigan...');
  const searchResp = await apolloClient.post('/mixed_people/search', searchPayload);
  const rawPeople = searchResp.data?.people ?? [];

  if (rawPeople.length === 0) {
    console.log('Apollo returned 0 results for this search.');
    return [];
  }

  console.log(`Got ${rawPeople.length} candidates from Apollo search.`);

  // Step 2 — Enrich with phone numbers (async reveal, costs direct-dial credits)
  const enrichedPeople = await enrichWithPhones(rawPeople);

  // Step 3 — Map to the spreadsheet column shape
  return enrichedPeople
    .map((p) => ({
      businessName: p.organization?.name ?? p.employment_history?.[0]?.organization_name ?? '',
      firstName: p.first_name ?? '',
      lastName: p.last_name ?? '',
      phone: bestPhone(p),
      city: extractCity(p),
      website: p.organization?.website_url ?? '',
    }))
    // Skip rows that have no phone (user only wants contacts with a number)
    .filter((lead) => lead.phone.trim() !== '');
}

/**
 * Calls the Apollo bulk-match endpoint with reveal_phone_number=true,
 * then polls for the async result.
 *
 * @param {Array} people  Raw people objects from the search response
 */
async function enrichWithPhones(people) {
  const details = people.map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    organization_name: p.organization?.name ?? '',
  }));

  console.log('Requesting phone enrichment for', details.length, 'contacts...');

  const matchResp = await apolloClient.post('/people/bulk_match', {
    details,
    reveal_phone_number: true,
  });

  const requestId = matchResp.data?.request_id;
  if (!requestId) {
    // Sync path — some plans return results immediately
    const syncPeople = matchResp.data?.matches ?? matchResp.data?.people ?? people;
    return syncPeople;
  }

  // Async path — poll until ready (max ~60s)
  return pollPhoneResult(requestId, people);
}

/**
 * Polls Apollo's webhook result endpoint until the phone enrichment is done.
 * Falls back to the original people array (without phones) if it times out.
 *
 * @param {string} requestId   The async request ID from the bulk-match call
 * @param {Array}  fallback    Original people to return if polling times out
 */
async function pollPhoneResult(requestId, fallback) {
  const MAX_ATTEMPTS = 8;
  const INITIAL_DELAY_MS = 10000; // 10 seconds

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const delay = INITIAL_DELAY_MS * attempt;
    console.log(`Polling phone result (attempt ${attempt}/${MAX_ATTEMPTS}, waiting ${delay / 1000}s)...`);
    await sleep(delay);

    try {
      const resp = await apolloClient.get(`/phone_numbers/webhook_results/${requestId}`);
      const status = resp.data?.status;

      if (status === 'success') {
        console.log('Phone enrichment complete.');
        return resp.data?.matches ?? resp.data?.people ?? fallback;
      }

      if (status === 'failed') {
        console.warn('Apollo phone enrichment returned status: failed. No credits charged.');
        return fallback;
      }

      // status === 'pending' — keep polling
    } catch (err) {
      if (err.response?.status === 404) {
        // Still processing — continue
        continue;
      }
      throw err;
    }
  }

  console.warn('Phone enrichment timed out after max polling attempts. Continuing without phones.');
  return fallback;
}

// Pick the best available phone number from a person record
function bestPhone(person) {
  return (
    person.mobile_phone ||
    person.direct_phone_number ||
    person.corporate_phone_number ||
    person.home_phone ||
    person.phone_numbers?.[0]?.sanitized_number ||
    ''
  );
}

// Extract the city from a person's location or their company's location
function extractCity(person) {
  const loc =
    person.city ||
    person.organization?.city ||
    '';
  return loc;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { searchHVACLeads };
