const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// ── Targeting config ─────────────────────────────────────────────────────────
// Edit CITIES to add/remove Southwest Michigan locations.
const CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

// Job titles in priority order. Apollo returns whoever matches — we sort by
// this list before handing leads to the sheet writer.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Industry keyword tags sent to Apollo. Add/remove to widen or narrow results.
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'heating',
  'air conditioning',
  'plumbing',
  'mechanical contracting',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function titlePriority(title = '') {
  const normalized = title.toLowerCase();
  for (let i = 0; i < TARGET_TITLES.length; i++) {
    if (normalized.includes(TARGET_TITLES[i].toLowerCase())) return i;
  }
  return TARGET_TITLES.length;
}

function extractPhone(person) {
  const numbers = person.phone_numbers || [];
  // Prefer mobile → work_direct → work_hq
  const preferred = ['mobile', 'work_direct', 'work_hq', 'other'];
  for (const type of preferred) {
    const match = numbers.find(n => (n.type || '').toLowerCase() === type);
    if (match && match.sanitized_number) return match.sanitized_number;
  }
  // Fall back to whatever is available
  const any = numbers.find(n => n.sanitized_number || n.raw_number);
  return any ? (any.sanitized_number || any.raw_number) : null;
}

function extractCity(person) {
  return (
    person.city ||
    (person.organization && person.organization.city) ||
    ''
  );
}

function normalizeLead(person) {
  const phone = extractPhone(person);
  const org = person.organization || {};
  return {
    businessName: org.name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: phone || '',
    city: extractCity(person),
    website: org.website_url || '',
    title: person.title || '',
  };
}

// ── Main search function ──────────────────────────────────────────────────────

/**
 * Fetches up to `maxLeads` HVAC leads from Apollo.io for Southwest Michigan.
 * Returns an array of normalized lead objects.
 */
async function fetchLeads(maxLeads = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment.');

  const locationStrings = CITIES.map(c => `${c}, Michigan, United States`);

  const payload = {
    api_key: apiKey,
    page: 1,
    // Fetch extra so we still have maxLeads after filtering out no-phone entries
    per_page: Math.min(maxLeads * 2, 100),
    person_titles: TARGET_TITLES,
    person_locations: locationStrings,
    organization_locations: locationStrings,
    // Employee range: "min,max" — owner-operated small businesses only
    organization_num_employees_ranges: ['1,25'],
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,
  };

  logger.info(`Apollo search: ${CITIES.length} cities | titles: ${TARGET_TITLES.join(', ')}`);

  let response;
  try {
    response = await axios.post(
      `${APOLLO_BASE_URL}/mixed_people/search`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
        timeout: 30000,
      }
    );
  } catch (err) {
    const status = err.response ? err.response.status : 'network error';
    const msg = err.response ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Apollo API request failed (${status}): ${msg}`);
  }

  const people = response.data.people || response.data.contacts || [];
  logger.info(`Apollo returned ${people.length} raw records.`);

  if (people.length === 0) {
    logger.warn('Apollo returned zero results for this search.');
    return [];
  }

  // Normalize, filter out anyone without a phone number, sort by title priority
  const leads = people
    .map(normalizeLead)
    .filter(lead => {
      if (!lead.phone) {
        logger.info(`  Skipped (no phone): ${lead.businessName} — ${lead.firstName} ${lead.lastName}`);
        return false;
      }
      if (!lead.businessName) {
        logger.info(`  Skipped (no business name): ${lead.firstName} ${lead.lastName}`);
        return false;
      }
      return true;
    })
    .sort((a, b) => titlePriority(a.title) - titlePriority(b.title));

  logger.info(`${leads.length} leads remain after phone filter.`);
  return leads.slice(0, maxLeads);
}

module.exports = { fetchLeads };
