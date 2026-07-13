// apollo.js — Apollo.io API calls: people search + async phone enrichment
//
// Apollo API docs: https://apolloio.github.io/apollo-api-docs/
// Auth: x-api-key header (set APOLLO_API_KEY in .env)
//
// Credit cost per run:
//   • People search  → free (no credits)
//   • Phone reveal   → credits per matched person with a found number
//     Check your plan at https://app.apollo.io/#/settings/plans/manage

const axios = require('axios');

const BASE_URL = 'https://api.apollo.io/v1';

// ── Configuration ─────────────────────────────────────────────────────────────
// Edit these arrays to change target geography, job titles, or industries.

// Southwest Michigan cities. Add city strings like 'City, Michigan, United States'.
const TARGET_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Job titles in priority order. Apollo also matches close variants.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industry keyword tags — Apollo matches these against company tags/descriptions.
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Air Conditioning',
  'Heating Cooling',
];

// SIC 1711 = Plumbing, Heating, and Air-Conditioning contractors.
// Add SIC 7623 (AC service/repair) or 1731 (electrical) if you want broader coverage.
const SIC_CODES = ['1711'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function headers() {
  return {
    'x-api-key': process.env.APOLLO_API_KEY,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── People Search ─────────────────────────────────────────────────────────────

// Returns raw Apollo person objects (no phone numbers yet).
async function searchProspects(limit) {
  const { data } = await axios.post(
    `${BASE_URL}/mixed_people/search`,
    {
      per_page: Math.min(limit, 100),
      page: 1,
      person_titles: TARGET_TITLES,
      include_similar_titles: true,          // catches "Co-owner", "Managing Partner", etc.
      person_seniorities: ['owner', 'founder', 'c_suite'],
      organization_locations: TARGET_LOCATIONS,
      organization_num_employees_ranges: ['1,25'],  // owner-operated only
      organization_sic_codes: SIC_CODES,
      q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    },
    { headers: headers() }
  );

  return data.people || [];
}

// ── Phone Enrichment (async) ──────────────────────────────────────────────────

// Submits up to 10 person IDs for phone enrichment.
// Apollo processes these asynchronously and returns a request_id to poll.
async function submitPhoneEnrichment(batch) {
  const { data } = await axios.post(
    `${BASE_URL}/people/bulk_match`,
    {
      reveal_phone_number: true,
      details: batch.map(p => ({ id: p.id })),
    },
    { headers: headers() }
  );

  // When reveal_phone_number=true, Apollo returns request_id (not results yet).
  if (!data.request_id) {
    throw new Error('Apollo did not return a request_id for phone enrichment.');
  }

  return data.request_id;
}

// Polls Apollo until phone numbers are ready (typically 5–30 seconds).
async function pollForPhones(requestId, maxWaitMs = 90000) {
  const pollInterval = 6000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await sleep(pollInterval);

    try {
      const { data } = await axios.get(
        `${BASE_URL}/webhook_results/${requestId}`,
        { headers: headers() }
      );

      if (data && Array.isArray(data.contacts)) {
        return data.contacts;
      }
    } catch (err) {
      if (err.response?.status === 404) continue; // not ready yet
      throw err;
    }
  }

  throw new Error(`Phone enrichment timed out after ${maxWaitMs / 1000}s (request_id: ${requestId})`);
}

// ── Phone Selection ───────────────────────────────────────────────────────────

// Prefer mobile and direct numbers over switchboard lines for owner-operated businesses.
const PHONE_PRIORITY = ['mobile', 'direct', 'work_hq', 'work_other', 'other'];

function pickBestPhone(phoneNumbers) {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) return null;

  for (const type of PHONE_PRIORITY) {
    const match = phoneNumbers.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }

  // Last resort: any number available
  const any = phoneNumbers.find(p => p.sanitized_number);
  return any ? any.sanitized_number : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

// Fetches up to `limit` HVAC prospects in SW Michigan with phone numbers.
// Returns an array of normalized lead objects ready to write to the sheet.
async function fetchLeads(limit = 25) {
  console.log(`Searching Apollo for HVAC prospects in SW Michigan (limit: ${limit})...`);

  const rawPeople = await searchProspects(limit);
  console.log(`Search returned ${rawPeople.length} prospect(s).`);

  if (rawPeople.length === 0) return [];

  // Enrich in batches of 10 (Apollo's bulk_match limit)
  const BATCH_SIZE = 10;
  const allEnriched = [];

  for (let i = 0; i < rawPeople.length; i += BATCH_SIZE) {
    const batch = rawPeople.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rawPeople.length / BATCH_SIZE);

    console.log(`Enriching batch ${batchNum}/${totalBatches} (${batch.length} people)...`);

    const requestId = await submitPhoneEnrichment(batch);
    const contacts = await pollForPhones(requestId);
    allEnriched.push(...contacts);

    if (i + BATCH_SIZE < rawPeople.length) await sleep(2000); // rate-limit pause
  }

  // Normalize and filter out contacts without any phone number
  const leads = allEnriched.reduce((acc, contact) => {
    const phone = pickBestPhone(contact.phone_numbers);
    if (!phone) return acc; // skip — no phone found

    const org = contact.organization || {};

    acc.push({
      businessName: org.name || '',
      firstName:    contact.first_name || '',
      lastName:     contact.last_name || '',
      phone,
      city:         org.city || contact.city || '',
      website:      org.primary_domain
                      ? `https://${org.primary_domain}`
                      : (org.website_url || ''),
    });

    return acc;
  }, []);

  console.log(`${leads.length}/${allEnriched.length} enriched contact(s) have a phone number.`);
  return leads;
}

module.exports = { fetchLeads };
