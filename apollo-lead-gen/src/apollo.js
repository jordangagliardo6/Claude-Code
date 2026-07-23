'use strict';

const axios = require('axios');
const { SW_MICHIGAN_CITIES, TARGET_INDUSTRIES, TARGET_TITLES } = require('./config');
const log = require('./logger');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// Search Apollo for HVAC decision-makers across all target cities.
// Returns an array of lead objects, deduplicated by business name.
async function searchLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set');

  const leads = [];
  const seenBusinessNames = new Set();

  for (const city of SW_MICHIGAN_CITIES) {
    if (leads.length >= maxResults) break;

    const perPage = Math.min(10, maxResults - leads.length);
    log.info(`Searching Apollo: ${city} (need ${perPage} more leads)`);

    try {
      const { data } = await axios.post(
        `${APOLLO_BASE}/mixed_people/search`,
        {
          api_key: apiKey,
          page: 1,
          per_page: perPage,
          person_titles: TARGET_TITLES,
          organization_locations: [city],
          // 1–25 employees targets owner-operated small businesses
          organization_num_employees_ranges: ['1,25'],
          q_organization_keyword_tags: TARGET_INDUSTRIES,
        },
        {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          timeout: 30_000,
        }
      );

      const people = data?.people ?? [];
      log.info(`  → Apollo returned ${people.length} contacts for ${city}`);

      for (const person of people) {
        if (leads.length >= maxResults) break;

        const businessName = person.organization?.name?.trim();
        if (!businessName) continue;

        // Skip if we already have this business from another city query
        if (seenBusinessNames.has(businessName.toLowerCase())) continue;

        const phone = extractPhone(person);
        if (!phone) {
          log.info(`  Skipping "${businessName}" — no phone number found`);
          continue;
        }

        seenBusinessNames.add(businessName.toLowerCase());
        leads.push({
          businessName,
          firstName:  person.first_name?.trim() || '',
          lastName:   person.last_name?.trim()  || '',
          phone,
          city:       extractCity(city),
          website:    person.organization?.website_url?.trim() || '',
        });
      }
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.message || err.message;
      log.error(`Apollo search failed for "${city}" (HTTP ${status})`, { message: detail });

      // 429 = rate limited — stop querying to avoid wasting the run
      if (status === 429) {
        log.warn('Apollo rate limit hit — stopping early');
        break;
      }
    }

    // Polite pause between city requests (Apollo rate limit: ~10 req/min on basic plans)
    await sleep(1500);
  }

  log.info(`Apollo search complete — ${leads.length} leads with phone numbers found`);
  return leads;
}

// Prefer mobile phone, then direct, then any available number.
function extractPhone(person) {
  if (person.mobile_phone) return person.mobile_phone;
  if (person.phone)        return person.phone;

  const numbers = person.phone_numbers ?? [];
  const mobile  = numbers.find(p => p.type === 'mobile');
  if (mobile) return mobile.raw_number;

  const direct  = numbers.find(p => p.type === 'direct');
  if (direct) return direct.raw_number;

  return numbers[0]?.raw_number ?? null;
}

// "Kalamazoo, Michigan, United States" → "Kalamazoo"
function extractCity(apolloLocation) {
  return apolloLocation.split(',')[0].trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { searchLeads };
