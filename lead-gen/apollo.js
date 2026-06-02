'use strict';

const axios = require('axios');
const { INDUSTRY_KEYWORDS, TARGET_TITLES, EMPLOYEE_RANGES } = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// Returns the best available phone number from Apollo's phone_numbers array.
// Priority: mobile > direct_phone > work > any
function pickBestPhone(phoneNumbers) {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) return null;

  const priority = ['mobile', 'direct_phone', 'work', 'other'];
  for (const type of priority) {
    const match = phoneNumbers.find(
      (p) => p.type === type && p.sanitized_number
    );
    if (match) return match.sanitized_number;
  }
  // Fall back to whatever is available
  const fallback = phoneNumbers.find((p) => p.sanitized_number);
  return fallback ? fallback.sanitized_number : null;
}

// Strips the state suffix from "City, MI" for the sheet's City column
function normalizeCity(cityStr) {
  if (!cityStr) return '';
  return cityStr.replace(/,\s*MI$/i, '').trim();
}

/**
 * Search Apollo for decision-makers at HVAC/plumbing companies in one city.
 *
 * @param {string} city   e.g. "Kalamazoo, MI"
 * @param {number} page   page number (1-indexed)
 * @param {number} perPage  results per page
 * @returns {Promise<{people: object[], totalPages: number}>}
 */
async function searchPeopleInCity(city, page = 1, perPage = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set');

  const payload = {
    api_key: apiKey,
    // Location filters — city-level for people, state-level for org
    person_locations: [city],
    organization_locations: ['Michigan, United States'],
    // Decision-maker titles
    person_titles: TARGET_TITLES,
    // Industry tags on the company
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
    // Company size: owner-operated small businesses only
    organization_num_employees_ranges: EMPLOYEE_RANGES,
    // Seniority bias (owner/founder typically map to "owner" seniority)
    person_seniorities: ['owner', 'founder', 'c_suite'],
    // Only return people who have at least one phone number
    contact_email_status: [], // not filtering by email
    per_page: perPage,
    page,
  };

  const response = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    }
  );

  const data = response.data;
  const people = (data.people || []).filter((p) => {
    // Only keep contacts that have at least one phone number
    return (
      Array.isArray(p.phone_numbers) &&
      p.phone_numbers.some((ph) => ph.sanitized_number)
    );
  });

  const totalPages = Math.ceil(
    (data.pagination?.total_entries || 0) / perPage
  );

  return { people, totalPages };
}

/**
 * Convert a raw Apollo person object into the flat lead record we'll write
 * to Google Sheets.
 */
function personToLead(person, sourceCity) {
  const org = person.organization || {};
  const phone = pickBestPhone(person.phone_numbers);

  // Use the person's reported city first; fall back to the search city
  const city =
    normalizeCity(person.city || org.city || '') ||
    normalizeCity(sourceCity);

  return {
    dateAdded: new Date().toLocaleDateString('en-US'),
    businessName: (org.name || person.employment_history?.[0]?.organization_name || '').trim(),
    firstName: (person.first_name || '').trim(),
    lastName: (person.last_name || '').trim(),
    phone: phone || '',
    city,
    website: (org.website_url || '').trim(),
    called: '',
    notes: '',
  };
}

/**
 * Fetch up to `limit` qualified leads across all target cities.
 * Cycles through cities round-robin so no single city dominates the batch.
 *
 * @param {string[]} cities  list of "City, MI" strings
 * @param {number}   limit   max leads to return
 * @returns {Promise<object[]>}
 */
async function fetchLeads(cities, limit) {
  const leads = [];
  const seenApolloIds = new Set();

  // One page per city first; if still under limit, loop page 2, etc.
  let page = 1;
  let exhausted = false;

  while (leads.length < limit && !exhausted) {
    exhausted = true; // assume done unless we find more
    for (const city of cities) {
      if (leads.length >= limit) break;

      const remaining = limit - leads.length;
      const perPage = Math.min(remaining + 10, 25); // fetch a few extra for dedup headroom

      try {
        const { people, totalPages } = await searchPeopleInCity(city, page, perPage);

        if (page <= totalPages) exhausted = false;

        for (const person of people) {
          if (leads.length >= limit) break;
          if (!person.id || seenApolloIds.has(person.id)) continue;
          seenApolloIds.add(person.id);

          const lead = personToLead(person, city);
          // Skip leads with no phone or no business name
          if (!lead.phone || !lead.businessName) continue;
          leads.push(lead);
        }
      } catch (err) {
        // Log per-city error but continue with other cities
        console.error(`[Apollo] Error fetching "${city}" page ${page}: ${err.message}`);
      }

      // Small delay to respect Apollo rate limits
      await new Promise((r) => setTimeout(r, 300));
    }
    page++;
  }

  return leads;
}

module.exports = { fetchLeads };
