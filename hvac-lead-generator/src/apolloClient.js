const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// Delay helper
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class ApolloClient {
  constructor(apiKey) {
    if (!apiKey) throw new Error('APOLLO_API_KEY is not set.');
    this.client = axios.create({
      baseURL: APOLLO_BASE,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      timeout: 30_000,
    });
  }

  // Search for decision-makers at small HVAC companies in Michigan.
  // Returns the full response body; caller reads .people and .pagination.
  async searchPeople({ personTitles, employeeRanges, naicsCodes, personLocations, organizationLocations, keywords, page = 1, perPage = 50 }) {
    const body = {
      person_titles: personTitles,
      organization_num_employees_ranges: employeeRanges,
      organization_naics_codes: naicsCodes,
      person_locations: personLocations,
      organization_locations: organizationLocations,
      q_keywords: keywords,
      page,
      per_page: perPage,
      include_similar_titles: false,
    };

    const res = await this.client.post('/mixed_people/search', body);
    return res.data;
  }

  // Enrich a batch of people (max 10 per call) to reveal phone numbers.
  // Returns the enriched people array, or an empty array on failure.
  async enrichWithPhones(apolloIds) {
    if (!apolloIds.length) return [];

    // Apollo bulk_match accepts up to 10 IDs at once
    const chunks = chunkArray(apolloIds, 10);
    const enriched = [];

    for (const chunk of chunks) {
      try {
        const body = {
          reveal_phone_number: true,
          details: chunk.map(id => ({ id })),
        };
        const res = await this.client.post('/people/bulk_match', body);
        const data = res.data;

        if (data.request_id) {
          // Async path — poll until the result is ready
          const people = await this._pollBulkMatch(data.request_id);
          enriched.push(...people);
        } else if (Array.isArray(data.matches)) {
          enriched.push(...data.matches);
        } else if (Array.isArray(data.people)) {
          enriched.push(...data.people);
        }
      } catch (err) {
        // A failed enrichment batch should not abort the whole run
        console.warn(`  Phone enrichment batch failed: ${err.response?.data?.message || err.message}`);
      }

      // Respect Apollo's rate limit between chunks
      if (chunks.length > 1) await sleep(1000);
    }

    return enriched;
  }

  // Poll the async bulk-match result endpoint until it's ready or times out.
  async _pollBulkMatch(requestId, maxAttempts = 12, delayMs = 5000) {
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(delayMs);
      try {
        const res = await this.client.get(`/people/bulk_match/${requestId}`);
        const data = res.data;
        if (data.status === 'complete' || Array.isArray(data.matches) || Array.isArray(data.people)) {
          return data.matches || data.people || [];
        }
      } catch (err) {
        if (err.response?.status !== 404) throw err;
        // 404 means not ready yet — keep polling
      }
    }
    console.warn(`  Timed out waiting for enrichment result ${requestId}`);
    return [];
  }
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

module.exports = ApolloClient;
