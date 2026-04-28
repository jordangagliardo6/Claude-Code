const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// ── Targeting configuration ───────────────────────────────────────────────────
// Edit these arrays to change the cities, industries, or titles you're after.

const TARGET_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Keywords Apollo uses to match an organization's industry/description
const TARGET_INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'heating and cooling',
  'air conditioning',
  'plumbing',
  'mechanical contracting',
  'mechanical contractor',
];

// Searched in priority order — Apollo returns the best-matching title first
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST a single people-search page to Apollo.
 * Returns { contacts: Array, pagination: Object|null }
 */
async function searchPage(page, perPage) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set');

  logger.info(`Apollo search — page ${page}, ${perPage} per page`);

  const body = {
    api_key: apiKey,
    // Keyword tags filter results to HVAC / plumbing orgs
    q_organization_keyword_tags: TARGET_INDUSTRY_KEYWORDS,
    person_titles: TARGET_TITLES,
    person_locations: TARGET_LOCATIONS,
    // Small business filter: 1–25 employees
    organization_num_employees_ranges: ['1,25'],
    // Only return contacts that have at least one phone number on file
    contact_phone_exists: true,
    page,
    per_page: perPage,
  };

  try {
    const { data } = await axios.post(`${APOLLO_BASE}/mixed_people/search`, body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      timeout: 30_000,
    });

    // Apollo returns results under 'people' or 'contacts' depending on version
    const contacts = data.people || data.contacts || [];
    logger.info(`Apollo page ${page}: received ${contacts.length} contacts`);

    return { contacts, pagination: data.pagination || null };
  } catch (err) {
    if (err.response) {
      const { status, data: errData } = err.response;
      throw new Error(`Apollo API ${status}: ${errData?.message || err.response.statusText}`);
    }
    throw new Error(`Apollo request failed: ${err.message}`);
  }
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

/**
 * Pick the best phone number from the contact's phone_numbers array.
 * Preference order: mobile → direct_phone → work → other
 */
function extractPhone(contact) {
  // Top-level sanitized_phone is the most reliable single field
  if (contact.sanitized_phone) return contact.sanitized_phone;

  const numbers = contact.phone_numbers;
  if (!numbers || numbers.length === 0) return null;

  const ORDER = { mobile: 0, direct_phone: 1, work: 2, other: 3 };
  const sorted = [...numbers].sort((a, b) => (ORDER[a.type] ?? 4) - (ORDER[b.type] ?? 4));
  return sorted[0].sanitized_number || sorted[0].raw_number || null;
}

/**
 * Format a raw phone string to (XXX) XXX-XXXX.
 * Strips leading country code (+1 / 1).
 */
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  const local = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return raw; // return as-is if we can't normalize
}

/**
 * Convert a raw Apollo contact object into the lead shape we write to Sheets.
 * Returns null if the contact is missing required fields (phone or business name).
 */
function parseContact(contact) {
  const businessName =
    contact.organization_name ||
    contact.employment_history?.[0]?.organization_name ||
    null;

  if (!businessName) return null;

  const rawPhone = extractPhone(contact);
  if (!rawPhone) return null;

  // City may live on the contact directly or inside a location string
  let city = contact.city || '';
  if (!city && typeof contact.location === 'string') {
    city = contact.location.split(',')[0].trim();
  }

  const org = contact.organization || {};
  const website =
    org.website_url ||
    (org.primary_domain ? `https://${org.primary_domain}` : '');

  return {
    businessName: businessName.trim(),
    firstName: (contact.first_name || '').trim(),
    lastName: (contact.last_name  || '').trim(),
    phone: formatPhone(rawPhone),
    city: city.trim(),
    website: website.trim(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch and parse up to `limit` valid leads from Apollo.
 * Paginates automatically and stops as soon as we have enough.
 */
async function fetchLeads(limit = 25) {
  const leads = [];
  let page = 1;
  // Over-fetch per page to compensate for contacts that fail parsing
  const perPage = Math.min(Math.max(limit * 2, 25), 100);

  while (leads.length < limit) {
    const { contacts, pagination } = await searchPage(page, perPage);

    if (!contacts || contacts.length === 0) {
      logger.info('Apollo: no more contacts available');
      break;
    }

    for (const contact of contacts) {
      if (leads.length >= limit) break;
      const lead = parseContact(contact);
      if (lead) leads.push(lead);
    }

    // Stop if Apollo has no further pages
    if (!pagination || page >= pagination.total_pages) break;
    page++;

    // Brief pause to stay well within Apollo's rate limits
    if (leads.length < limit) await new Promise(r => setTimeout(r, 600));
  }

  logger.info(`Apollo: parsed ${leads.length} valid leads`);
  return leads.slice(0, limit);
}

/** Smoke-test: confirm API key is valid and search returns something. */
async function testConnection() {
  try {
    logger.info('Testing Apollo.io connection...');
    const { contacts, pagination } = await searchPage(1, 1);
    const total = pagination?.total_entries ?? contacts.length;
    logger.info(`Apollo OK — ${total} total results available for configured search`);
    return true;
  } catch (err) {
    logger.error('Apollo connection test failed', err);
    return false;
  }
}

module.exports = { fetchLeads, testConnection, TARGET_LOCATIONS, TARGET_TITLES };
