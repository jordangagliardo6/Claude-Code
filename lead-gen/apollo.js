// ─── Apollo.io API Module ────────────────────────────────────────────────────
// Handles searching for HVAC owner-operators and enriching their phone numbers.
//
// PLAN REQUIREMENT: People Search + Phone Reveal both require Apollo Basic or
// higher. The free plan returns API_INACCESSIBLE for /mixed_people/search.
// Upgrade at: https://www.apollo.io/pricing
// ────────────────────────────────────────────────────────────────────────────

const axios = require('axios');

const API_BASE = 'https://api.apollo.io/v1';

// Priority order for sorting when multiple titles are returned
const TITLE_PRIORITY = ['owner', 'president', 'founder', 'co-founder', 'co founder', 'general manager'];

function getTitlePriority(title) {
  if (!title) return TITLE_PRIORITY.length;
  const lower = title.toLowerCase();
  const idx = TITLE_PRIORITY.findIndex(t => lower.includes(t));
  return idx === -1 ? TITLE_PRIORITY.length : idx;
}

// Prefer mobile/direct numbers; fall back to any available number
function selectBestPhone(person) {
  const phones = person.phone_numbers || [];
  if (!phones.length) return person.sanitized_phone || null;
  const preferred = phones.find(p => ['mobile', 'direct'].includes(p.type));
  return (preferred || phones[0]).sanitized_number || person.sanitized_phone || null;
}

// Build apollo-compatible location strings for each city
function buildLocationList(cities, state) {
  return cities.map(city => `${city}, ${state}, United States`);
}

// Step 1: Search the Apollo people database for matching contacts.
// Returns basic contact records (no phone numbers yet).
async function searchPeople({ cities, state, jobTitles, sicCodes, keywordTags, employeeRanges }) {
  const payload = {
    person_titles: jobTitles,
    person_locations: buildLocationList(cities, state),
    organization_num_employees_ranges: employeeRanges,
    organization_sic_codes: sicCodes,
    q_organization_keyword_tags: keywordTags,
    per_page: 100, // fetch more than needed; we'll trim after enrichment
    page: 1,
  };

  const response = await axios.post(`${API_BASE}/mixed_people/search`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.APOLLO_API_KEY,
    },
  });

  const data = response.data;
  if (data.error || data.error_code) {
    throw new Error(`Apollo search error: ${data.error || data.error_code}`);
  }

  return data.people || [];
}

// Step 2: Enrich a batch of people to reveal phone numbers.
// Each reveal costs 1 credit. We batch in groups of 10.
async function enrichPeople(people) {
  if (!people.length) return [];

  const BATCH_SIZE = 10;
  const results = [];

  for (let i = 0; i < people.length; i += BATCH_SIZE) {
    const batch = people.slice(i, i + BATCH_SIZE);

    const response = await axios.post(
      `${API_BASE}/people/bulk_match`,
      {
        details: batch.map(p => ({ id: p.id })),
        reveal_phone_number: true,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.APOLLO_API_KEY,
        },
      }
    );

    const data = response.data;
    if (data.error || data.error_code) {
      throw new Error(`Apollo enrichment error: ${data.error || data.error_code}`);
    }

    results.push(...(data.matches || []));

    // Pause between batches to stay within Apollo's rate limits
    if (i + BATCH_SIZE < people.length) {
      await new Promise(r => setTimeout(r, 600));
    }
  }

  return results;
}

// Main export: search + enrich + filter to contacts with phone numbers
async function fetchLeads(config) {
  const { cities, state } = config;
  const { jobTitles, sicCodes, keywordTags, employeeRanges, maxLeadsPerRun } = config.apollo;

  // Search for candidates
  const candidates = await searchPeople({ cities, state, jobTitles, sicCodes, keywordTags, employeeRanges });

  if (!candidates.length) return [];

  // Sort by title priority so Owner/President come first
  candidates.sort((a, b) => getTitlePriority(a.title) - getTitlePriority(b.title));

  // Enrich more than we need to ensure we hit the limit after filtering no-phone results
  const enrichLimit = Math.min(maxLeadsPerRun * 3, candidates.length);
  const enriched = await enrichPeople(candidates.slice(0, enrichLimit));

  // Map to lead records, skipping anyone without a phone number
  const leads = [];
  for (const person of enriched) {
    const phone = selectBestPhone(person);
    if (!phone) continue;

    leads.push({
      businessName: person.organization?.name || '',
      firstName: person.first_name || '',
      lastName: person.last_name || '',
      phone,
      city: person.city || person.organization?.city || '',
      website: person.organization?.website_url || '',
    });

    if (leads.length >= maxLeadsPerRun) break;
  }

  return leads;
}

// Quick auth check — hits a lightweight endpoint to confirm the API key works
async function testAuth() {
  const response = await axios.get(`${API_BASE}/auth/health`, {
    headers: { 'X-Api-Key': process.env.APOLLO_API_KEY },
  });
  return response.data;
}

module.exports = { fetchLeads, testAuth };
