'use strict';

const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// ── Configurable search parameters ───────────────────────────────────────────
// Edit these arrays to change target cities, industries, or job titles.

const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

const INDUSTRY_KEYWORDS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
];

// Priority order matters: Owner > President > Founder > Co-Founder > General Manager
const DECISION_MAKER_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Apollo employee-count range strings covering 1–25 employees.
// Apollo uses predefined buckets; "21,50" is the closest upper bound to 25.
// Leads with 26–50 employees are filtered out post-fetch via EMPLOYEE_MAX.
const EMPLOYEE_RANGES = ['1,10', '11,20', '21,50'];
const EMPLOYEE_MAX = 25;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the best available phone from a person record.
 * Prefers person-level mobile/direct lines; falls back to org main phone.
 */
function extractPhone(person) {
  const nums = person.phone_numbers;
  if (Array.isArray(nums) && nums.length > 0) {
    const mobile = nums.find(n => n.type === 'mobile');
    const direct = nums.find(n => n.type === 'direct');
    const best = mobile || direct || nums[0];
    return best.sanitized_number || best.raw_number || null;
  }

  const org = person.organization || {};
  if (org.primary_phone) {
    return org.primary_phone.sanitized_number || org.primary_phone.number || null;
  }
  return org.sanitized_phone || org.phone || null;
}

/**
 * Numeric priority for a job title (lower = higher priority).
 * Used to keep the most senior decision-maker when a company has multiple matches.
 */
function titlePriority(title) {
  if (!title) return 99;
  const t = title.toLowerCase();
  const order = ['owner', 'president', 'founder', 'co-founder', 'co founder', 'general manager'];
  const idx = order.findIndex(o => t.includes(o));
  return idx === -1 ? 99 : idx;
}

/**
 * Return the reported employee count as a number, or null if unavailable.
 * Apollo stores employee count as a string like "11-20" or as an integer.
 */
function parseEmployeeCount(person) {
  const org = person.organization || {};
  const raw = org.num_employees || org.estimated_num_employees;
  if (!raw) return null;
  if (typeof raw === 'number') return raw;
  // Parse upper bound from range string like "11-20" → 20
  const parts = String(raw).split(/[-–,]/);
  return parseInt(parts[parts.length - 1], 10) || null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Search Apollo.io for HVAC decision-makers in Southwest Michigan.
 * Returns an array of normalized lead objects (up to maxResults).
 */
async function searchLeads(maxResults = 25) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment');

  logger.info('Searching Apollo.io for HVAC leads...', {
    cities: SW_MICHIGAN_CITIES.map(c => c.split(',')[0]),
    industries: INDUSTRY_KEYWORDS,
    maxResults,
  });

  const allPeople = [];
  let page = 1;

  // Fetch pages until we have a comfortable pool to filter from, or results end
  while (allPeople.length < maxResults * 4) {
    let res;
    try {
      res = await axios.post(
        `${APOLLO_BASE}/mixed_people/search`,
        {
          api_key: apiKey,
          q_organization_keyword_tags: INDUSTRY_KEYWORDS,
          person_titles: DECISION_MAKER_TITLES,
          person_locations: SW_MICHIGAN_CITIES,
          organization_num_employees_ranges: EMPLOYEE_RANGES,
          per_page: 25,
          page,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
          timeout: 30_000,
        }
      );
    } catch (err) {
      const status = err.response && err.response.status;

      if (status === 401) throw new Error('Apollo API key is invalid or expired');
      if (status === 422 || status === 400) {
        logger.warn('Apollo rejected search params — stopping pagination', {
          status,
          body: err.response.data,
        });
        break;
      }
      if (status === 429) {
        logger.warn('Apollo rate limit reached — stopping pagination');
        break;
      }
      throw new Error(`Apollo request failed: ${err.message}`);
    }

    // Apollo returns results under 'people' or 'contacts' depending on API version
    const batch = res.data.people || res.data.contacts || [];
    if (batch.length === 0) {
      logger.info(`No more results at page ${page}`);
      break;
    }

    allPeople.push(...batch);
    const pagination = res.data.pagination || {};
    const totalPages = pagination.total_pages || 1;

    logger.info(
      `Page ${page}/${totalPages}: fetched ${batch.length} (${allPeople.length} total)`
    );

    if (page >= totalPages) break;
    page++;

    // Polite delay between Apollo requests
    await new Promise(r => setTimeout(r, 600));
  }

  logger.info(`Raw candidates from Apollo: ${allPeople.length}`);

  // ── Filter ────────────────────────────────────────────────────────────────

  // 1. Must have a phone number
  const withPhone = allPeople.filter(p => extractPhone(p) !== null);
  logger.info(`With phone number: ${withPhone.length}`);

  // 2. Drop any company that Apollo reports as having more than EMPLOYEE_MAX staff
  const withinSize = withPhone.filter(p => {
    const count = parseEmployeeCount(p);
    return count === null || count <= EMPLOYEE_MAX;
  });
  logger.info(`Within size limit (≤${EMPLOYEE_MAX}): ${withinSize.length}`);

  // 3. Sort by title priority so the most senior person wins deduplication
  withinSize.sort((a, b) => titlePriority(a.title) - titlePriority(b.title));

  // 4. One contact per company (keep highest-priority title)
  const seenOrgs = new Set();
  const deduped = withinSize.filter(p => {
    const name = (p.organization && p.organization.name || '').toLowerCase().trim();
    if (!name) return true;
    if (seenOrgs.has(name)) return false;
    seenOrgs.add(name);
    return true;
  });

  logger.info(`After deduplication (one per company): ${deduped.length}`);

  // ── Normalize ─────────────────────────────────────────────────────────────
  const leads = deduped.slice(0, maxResults).map(p => ({
    businessName: (p.organization && p.organization.name) || '',
    firstName: p.first_name || '',
    lastName: p.last_name || '',
    phone: extractPhone(p) || '',
    city: p.city || '',
    website: (p.organization && p.organization.website_url) || '',
  }));

  logger.info(`Final lead count for this run: ${leads.length}`);
  return leads;
}

module.exports = { searchLeads, SW_MICHIGAN_CITIES, INDUSTRY_KEYWORDS, DECISION_MAKER_TITLES };
