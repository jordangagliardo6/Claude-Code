require('dotenv').config();
const axios = require('axios');
const { log } = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// Title priority order — Apollo returns contacts ranked, but we also filter server-side
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Southwest Michigan cities to search across
// To add cities later, just append to this array
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// HVAC-related industries / keyword tags to match against
// To add keywords later, extend this array
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating',
  'cooling',
  'air conditioning',
];

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': process.env.APOLLO_API_KEY,
  };
}

// Apollo people search — returns raw contact objects
async function searchPeople(page = 1, perPage = 25) {
  const payload = {
    // Keyword filter covering HVAC and related trades
    q_organization_keyword_tags: INDUSTRY_KEYWORDS,

    // Decision-maker titles in priority order
    person_titles: TARGET_TITLES,

    // Southwest Michigan cities
    person_locations: SW_MICHIGAN_LOCATIONS,

    // 1–25 employees (owner-operated small businesses)
    organization_num_employees_ranges: ['1,25'],

    // Only return contacts that have at least one phone number
    contact_phone_status: ['verified', 'likely_to_be_correct'],

    page,
    per_page: perPage,
  };

  log.debug(`Apollo request payload: ${JSON.stringify(payload, null, 2)}`);

  const response = await axios.post(
    `${APOLLO_BASE_URL}/mixed_people/search`,
    payload,
    { headers: getHeaders() }
  );

  log.debug(`Apollo response status: ${response.status}`);
  return response.data;
}

// Extract the best phone number from a contact (direct > mobile > other)
function pickBestPhone(contact) {
  if (contact.phone_numbers && contact.phone_numbers.length > 0) {
    // Prefer direct/mobile over other types
    const priority = ['direct', 'mobile', 'work', 'other'];
    for (const type of priority) {
      const match = contact.phone_numbers.find(p => p.type === type && p.sanitized_number);
      if (match) return match.sanitized_number;
    }
    // Fallback: first available
    const first = contact.phone_numbers.find(p => p.sanitized_number);
    if (first) return first.sanitized_number;
  }
  // Apollo also exposes a top-level phone field
  return contact.phone || null;
}

// Map a raw Apollo contact to a clean lead object
function mapContactToLead(contact) {
  const org = contact.organization || {};

  const phone = pickBestPhone(contact);
  if (!phone) return null; // skip contacts with no phone

  return {
    businessName:  org.name || contact.organization_name || '',
    firstName:     contact.first_name || '',
    lastName:      contact.last_name || '',
    phone,
    city:          contact.city || org.city || '',
    website:       org.website_url || '',
    title:         contact.title || '',
  };
}

// Rank leads by title priority so Owners appear before General Managers
function rankByTitle(leads) {
  return leads.sort((a, b) => {
    const ai = TARGET_TITLES.findIndex(t => a.title.toLowerCase().includes(t.toLowerCase()));
    const bi = TARGET_TITLES.findIndex(t => b.title.toLowerCase().includes(t.toLowerCase()));
    const aRank = ai === -1 ? TARGET_TITLES.length : ai;
    const bRank = bi === -1 ? TARGET_TITLES.length : bi;
    return aRank - bRank;
  });
}

// Main export — fetch up to `limit` qualified leads from Apollo
async function fetchLeads(limit = 25) {
  log.info(`Searching Apollo for HVAC leads in Southwest Michigan (limit: ${limit})...`);

  const rawData = await searchPeople(1, Math.min(limit * 2, 100)); // fetch extra to account for phone-less contacts

  const people = rawData.people || rawData.contacts || [];
  const totalFound = rawData.pagination?.total_entries || people.length;
  log.info(`Apollo returned ${people.length} contacts (${totalFound} total available)`);

  if (people.length === 0) {
    return [];
  }

  // Map, filter nulls (no phone), dedupe by business name within this batch, then rank
  const leads = people
    .map(mapContactToLead)
    .filter(Boolean);

  const deduped = [];
  const seen = new Set();
  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(lead);
    }
  }

  const ranked = rankByTitle(deduped);
  const result = ranked.slice(0, limit);

  log.info(`After filtering: ${result.length} qualified leads with phone numbers`);
  return result;
}

module.exports = { fetchLeads };
