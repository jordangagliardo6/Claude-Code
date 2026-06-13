'use strict';
require('dotenv').config();
const axios = require('axios');
const config = require('./config');
const log = require('./logger');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// Extracts the best available phone number from an Apollo person record.
function extractPhone(person) {
  // Prefer direct mobile/sanitized phone on the person record
  if (person.sanitized_phone) return person.sanitized_phone;

  // Fall back to the phone_numbers array (mobile first, then direct, then work)
  if (Array.isArray(person.phone_numbers) && person.phone_numbers.length > 0) {
    const priority = ['mobile', 'direct_dial', 'work_hq'];
    for (const type of priority) {
      const found = person.phone_numbers.find((p) => p.type === type && p.sanitized_number);
      if (found) return found.sanitized_number;
    }
    return person.phone_numbers[0].sanitized_number || null;
  }

  return null;
}

// Returns the title priority rank (lower = higher priority). -1 means not in the list.
function titleRank(title) {
  if (!title) return 999;
  const lower = title.toLowerCase();
  const priority = config.jobTitlePriority.map((t) => t.toLowerCase());
  const idx = priority.findIndex((p) => lower.includes(p));
  return idx === -1 ? 999 : idx;
}

// Checks whether the person's city or company city matches one of our target cities.
function matchesTargetCity(person) {
  const cities = config.targetCities.map((c) => c.toLowerCase());

  const personCity = (person.city || '').toLowerCase();
  const orgCity = (person.organization?.city || '').toLowerCase();

  return cities.some((c) => personCity.includes(c) || orgCity.includes(c));
}

// Normalises an Apollo person record to our lead schema.
function normaliseLead(person) {
  const org = person.organization || {};
  return {
    businessName: org.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: extractPhone(person) || '',
    city: person.city || org.city || '',
    website: org.website_url || '',
    titleRank: titleRank(person.title),
  };
}

// Fetches up to `maxLeads` HVAC leads from Apollo matching our filters.
async function fetchLeads(maxLeads = config.maxLeadsPerRun) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  log.info('Querying Apollo.io for HVAC leads in Southwest Michigan…');

  // Build location strings for each target city
  const cityLocations = config.targetCities.map(
    (city) => `${city}, ${config.targetState}, United States`
  );

  const payload = {
    per_page: Math.min(maxLeads * 4, 100), // fetch extra so we can filter & dedup
    page: 1,
    person_titles: config.jobTitlePriority,
    include_similar_titles: true,
    person_seniorities: ['owner', 'founder', 'c_suite'],
    // Search both by organization location AND person location to maximise coverage
    organization_locations: [`${config.targetState}, United States`],
    person_locations: cityLocations,
    organization_num_employees_ranges: [config.companySizeRange],
    organization_naics_codes: config.naicsCodes,
    organization_sic_codes: config.sicCodes,
    q_organization_keyword_tags: config.industryKeywords,
  };

  const response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 30_000,
  });

  const people = response.data?.people || [];
  log.info(`Apollo returned ${people.length} raw results.`);

  // ── Post-process ─────────────────────────────────────────────────────────────
  // 1. Only keep contacts with a phone number
  const withPhone = people.filter((p) => extractPhone(p));

  // 2. Only keep contacts in our target cities (broad Michigan filter may pull extras)
  const inCity = withPhone.filter(matchesTargetCity);

  // 3. Deduplicate by company name — keep the highest-priority title per company
  const byCompany = new Map();
  for (const person of inCity) {
    const key = (person.organization?.name || '').toLowerCase().trim();
    if (!key) continue;

    const existing = byCompany.get(key);
    const currentRank = titleRank(person.title);
    if (!existing || currentRank < titleRank(existing.title)) {
      byCompany.set(key, person);
    }
  }

  const deduped = Array.from(byCompany.values());
  log.info(`After filtering: ${withPhone.length} with phone, ${inCity.length} in target cities, ${deduped.length} unique companies.`);

  // 4. Normalise and cap at maxLeads
  return deduped.slice(0, maxLeads).map(normaliseLead);
}

module.exports = { fetchLeads };
