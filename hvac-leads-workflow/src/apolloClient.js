const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

const apolloHttp = axios.create({
  baseURL: config.apollo.baseUrl,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// ── Search ─────────────────────────────────────────────────────────────────
// Calls POST /api/v1/mixed_people/search.
// Returns an array of raw person objects from Apollo.
// Requires Apollo Basic plan or above.
async function searchPeople(page = 1) {
  const payload = {
    api_key: config.apollo.apiKey,
    per_page: config.apollo.leadsPerRun,
    page,
    person_titles: config.targetTitles,
    person_seniorities: ['owner', 'founder', 'c_suite', 'vp'],
    organization_locations: config.targetCities,
    organization_num_employees_ranges: config.employeeRanges,
    q_organization_keyword_tags: config.industryKeywords,
    // Ask Apollo to surface contact phone numbers directly in search results.
    // This works on plans that include phone reveal in search; otherwise use
    // enrichForPhones=true to call the match endpoint per person.
    contact_phone_numbers: true,
  };

  logger.info(`Apollo search — page ${page}, up to ${config.apollo.leadsPerRun} results`);

  try {
    const { data } = await apolloHttp.post('/api/v1/mixed_people/search', payload);

    if (data.error) {
      throw new Error(`Apollo API error: ${data.error}`);
    }

    const people = data.people || [];
    logger.info(`Apollo returned ${people.length} raw prospects (total available: ${data.pagination?.total_entries ?? 'unknown'})`);
    return people;
  } catch (err) {
    if (err.response?.status === 403 || err.response?.data?.error_code === 'API_INACCESSIBLE') {
      throw new Error(
        'Apollo plan restriction: the People Search endpoint requires an Apollo Basic plan or above. ' +
        'Upgrade at https://app.apollo.io/ then retry.'
      );
    }
    throw err;
  }
}

// ── Enrich (optional) ──────────────────────────────────────────────────────
// Calls POST /api/v1/people/match to reveal phone numbers for a single person.
// Costs 1 Apollo export credit per call. Only invoked when ENRICH_FOR_PHONES=true.
async function enrichPerson(person) {
  const payload = {
    api_key: config.apollo.apiKey,
    first_name: person.first_name,
    last_name: person.last_name,
    organization_name: person.organization?.name,
    domain: person.organization?.website_url,
    reveal_personal_emails: false,
    reveal_phone_number: true,
  };

  try {
    const { data } = await apolloHttp.post('/api/v1/people/match', payload);

    if (data.error) {
      logger.warn(`Enrich failed for ${person.first_name} ${person.last_name}: ${data.error}`);
      return null;
    }

    return data.person || null;
  } catch (err) {
    logger.warn(`Enrich request failed for ${person.first_name} ${person.last_name}: ${err.message}`);
    return null;
  }
}

// ── Extract phone ──────────────────────────────────────────────────────────
// Picks the best available phone number from an Apollo person record.
// Priority: direct > mobile > any other type.
function extractPhone(person) {
  const phones = person.phone_numbers || [];

  if (phones.length === 0) return person.sanitized_phone || null;

  const rank = { direct: 0, mobile: 1, work_hq: 2, home: 3, other: 4 };
  const sorted = [...phones].sort((a, b) => {
    const ra = rank[a.type] ?? 5;
    const rb = rank[b.type] ?? 5;
    return ra - rb;
  });

  return sorted[0]?.sanitized_number || sorted[0]?.raw_number || null;
}

// ── Build leads ────────────────────────────────────────────────────────────
// Converts raw Apollo person objects into clean lead records ready for the sheet.
// Filters out anyone without a phone number.
async function buildLeads(rawPeople) {
  const leads = [];

  for (const person of rawPeople) {
    let record = person;

    // Optionally enrich to get phone number if not present in search results
    if (config.apollo.enrichForPhones && !extractPhone(person)) {
      logger.info(`Enriching ${person.first_name} ${person.last_name} for phone number (costs 1 credit)`);
      const enriched = await enrichPerson(person);
      if (enriched) record = enriched;
    }

    const phone = extractPhone(record);

    // Skip contacts with no phone — they're not actionable
    if (!phone) {
      logger.info(`Skipping ${person.first_name} ${person.last_name} (${person.organization?.name}) — no phone number`);
      continue;
    }

    leads.push({
      businessName: record.organization?.name || '',
      firstName: record.first_name || '',
      lastName: record.last_name || '',
      phone,
      city: record.city || record.organization?.city || '',
      website: record.organization?.website_url || '',
    });
  }

  // Sort by title priority so Owners appear before GMs in the sheet
  const titleRank = Object.fromEntries(config.targetTitles.map((t, i) => [t.toLowerCase(), i]));
  leads.sort((a, b) => {
    const ra = titleRank[a.title?.toLowerCase()] ?? 99;
    const rb = titleRank[b.title?.toLowerCase()] ?? 99;
    return ra - rb;
  });

  return leads;
}

module.exports = { searchPeople, buildLeads };
