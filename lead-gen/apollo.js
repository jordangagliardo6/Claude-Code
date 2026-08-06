/**
 * Apollo.io REST API module.
 *
 * Uses the Apollo People Search and People Bulk Match (enrichment) endpoints
 * to find HVAC decision-makers in Southwest Michigan with phone numbers.
 *
 * Docs: https://apolloio.github.io/apollo-api-docs/
 */

const https = require('https');

const APOLLO_BASE = 'https://api.apollo.io';

// --------------------------------------------------------------------------
// Low-level HTTP helper (no external dependencies)
// --------------------------------------------------------------------------

function apolloPost(path, payload, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.apollo.io',
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Apollo API ${res.statusCode}: ${parsed.message || parsed.error || data}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Apollo API returned non-JSON: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// --------------------------------------------------------------------------
// People Search — finds person IDs matching the HVAC + location filters
// --------------------------------------------------------------------------

/**
 * @param {object} config - from config.js
 * @param {string} apiKey - APOLLO_API_KEY env var
 * @param {number} page   - pagination page (1-indexed)
 * @returns {Promise<{people: object[], totalResults: number}>}
 */
async function searchPeople(config, apiKey, page = 1) {
  const payload = {
    person_titles: config.personTitles,
    person_locations: config.targetCities,
    organization_locations: [config.organizationLocation],
    organization_num_employees_ranges: [config.employeeRange],
    q_organization_keyword_tags: config.industryKeywords,
    // Only return people who have a phone number listed
    contact_phone_numbers_required: true,
    per_page: config.maxLeadsPerRun,
    page,
  };

  const result = await apolloPost('/api/v1/mixed_people/api_search', payload, apiKey);

  return {
    people: result.people || [],
    totalResults: result.pagination?.total_entries || 0,
  };
}

// --------------------------------------------------------------------------
// People Bulk Match — enriches search results to reveal full phone numbers
// --------------------------------------------------------------------------

/**
 * Takes the lightweight person objects from searchPeople and enriches them.
 * Returns only people who have at least one usable phone number.
 *
 * @param {object[]} people - raw people objects from search
 * @param {string}   apiKey
 * @returns {Promise<object[]>} enriched person objects with phone numbers
 */
async function enrichPeople(people, apiKey) {
  if (!people.length) return [];

  // Build match inputs — id is the Apollo person ID from search results
  const matchInputs = people.map((p) => ({ id: p.id }));

  const result = await apolloPost(
    '/api/v1/people/bulk_match',
    { details: matchInputs, reveal_phone_number: true },
    apiKey,
  );

  const enriched = result.matches || [];

  // Keep only contacts that have at least one phone number
  return enriched.filter((p) => {
    const phones = p.phone_numbers || [];
    return phones.length > 0;
  });
}

// --------------------------------------------------------------------------
// Main export: search + enrich in one call
// --------------------------------------------------------------------------

/**
 * Returns up to config.maxLeadsPerRun enriched leads with phone numbers.
 *
 * @param {object} config - from config.js
 * @param {string} apiKey - APOLLO_API_KEY env var
 * @returns {Promise<object[]>}
 */
async function fetchLeads(config, apiKey) {
  console.log('[Apollo] Searching for HVAC contacts in Southwest Michigan...');
  const { people, totalResults } = await searchPeople(config, apiKey);
  console.log(`[Apollo] Found ${totalResults} total matches; fetched ${people.length} for this run.`);

  if (!people.length) return [];

  console.log(`[Apollo] Enriching ${people.length} contacts to retrieve phone numbers...`);
  const enriched = await enrichPeople(people, apiKey);
  console.log(`[Apollo] ${enriched.length} contacts have phone numbers after enrichment.`);

  return enriched;
}

// --------------------------------------------------------------------------
// Shape a raw Apollo person object into our spreadsheet row format
// --------------------------------------------------------------------------

/**
 * Picks the best available phone number from a person record.
 * Priority: direct → mobile → any first number
 */
function pickPhone(person) {
  const phones = person.phone_numbers || [];
  if (!phones.length) return '';

  const direct = phones.find((p) => p.type === 'direct_phone');
  if (direct) return direct.sanitized_number || direct.raw_number;

  const mobile = phones.find((p) => p.type === 'mobile_phone');
  if (mobile) return mobile.sanitized_number || mobile.raw_number;

  return phones[0].sanitized_number || phones[0].raw_number;
}

/**
 * Converts an Apollo person object to a flat row object matching config.columns.
 *
 * @param {object} person - enriched Apollo person
 * @param {string} dateAdded - ISO date string
 * @returns {object}
 */
function personToRow(person, dateAdded) {
  // City: prefer person's city, fall back to organization city
  const city =
    person.city ||
    person.organization?.city ||
    '';

  return {
    'Date Added': dateAdded,
    'Business Name': person.organization?.name || person.employment_history?.[0]?.organization_name || '',
    'Owner First Name': person.first_name || '',
    'Owner Last Name': person.last_name || '',
    'Phone Number': pickPhone(person),
    'City': city,
    'Website': person.organization?.website_url || '',
    'Called': '',
    'Notes': '',
  };
}

module.exports = { fetchLeads, personToRow };
