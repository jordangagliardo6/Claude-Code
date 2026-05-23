'use strict';

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// Title-priority order for picking the best contact when a company has multiple
const TITLE_PRIORITY = config.TARGET_JOB_TITLES.map(t => t.toLowerCase());

function titleScore(title = '') {
  const t = title.toLowerCase();
  const idx = TITLE_PRIORITY.findIndex(p => t.includes(p));
  return idx === -1 ? TITLE_PRIORITY.length : idx; // lower = higher priority
}

/**
 * Search Apollo for HVAC decision-makers in SW Michigan.
 * Returns an array of normalized lead objects.
 */
async function searchLeads(maxResults = config.MAX_LEADS_PER_RUN) {
  if (!config.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': config.APOLLO_API_KEY,
  };

  // We over-fetch slightly to account for contacts without phone numbers
  const fetchSize = Math.min(maxResults * 3, 100);

  const payload = {
    per_page: fetchSize,
    page: 1,

    // Location — broad Michigan filter; we refine by city below
    person_locations: config.TARGET_CITIES,
    organization_locations: config.TARGET_LOCATIONS,

    // Company size: 1–25 employees
    organization_num_employees_ranges: config.EMPLOYEE_RANGES,

    // Job titles
    person_titles: config.TARGET_JOB_TITLES,
    include_similar_titles: true,

    // Industry keywords passed as org keyword tags
    q_organization_keyword_tags: config.INDUSTRY_KEYWORDS,

    // Only return people whose seniority signals decision-making authority
    person_seniorities: ['owner', 'founder', 'c_suite', 'president'],
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, { headers });
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`Apollo API error: ${detail}`);
  }

  const people = response.data?.people || [];
  if (people.length === 0) {
    return [];
  }

  // Group by organization so we pick the best-titled contact per company
  const byOrg = {};
  for (const person of people) {
    const orgName = person.organization?.name || person.employment_history?.[0]?.organization_name;
    if (!orgName) continue;

    const key = orgName.toLowerCase().trim();
    if (!byOrg[key]) byOrg[key] = [];
    byOrg[key].push(person);
  }

  const leads = [];
  for (const [, contacts] of Object.entries(byOrg)) {
    // Sort by title priority and pick the best one
    contacts.sort((a, b) => titleScore(a.title) - titleScore(b.title));
    const best = contacts[0];

    const phone = extractPhone(best);

    // Skip contacts with no phone — per requirements
    if (!phone) continue;

    const city = extractCity(best);
    const org = best.organization || {};

    leads.push({
      businessName: org.name || best.employment_history?.[0]?.organization_name || '',
      firstName: best.first_name || '',
      lastName: maskCheck(best.last_name) ? '' : (best.last_name || ''),
      phone,
      city,
      website: org.website_url || '',
    });

    if (leads.length >= maxResults) break;
  }

  return leads;
}

// Apollo sometimes masks last names as "L." on lower-tier plans
function maskCheck(lastName) {
  return !lastName || /^[A-Z]\.$/.test(lastName.trim());
}

function extractPhone(person) {
  // Prefer sanitized_phone, then fall back to phone number fields
  if (person.sanitized_phone) return person.sanitized_phone;
  if (person.phone_numbers?.length) {
    // Prefer mobile, then direct, then any
    const mobile = person.phone_numbers.find(p => p.type === 'mobile' || p.type === 'direct');
    return mobile?.sanitized_number || person.phone_numbers[0]?.sanitized_number || '';
  }
  return '';
}

function extractCity(person) {
  if (person.city) return person.city;
  if (person.location?.city) return person.location.city;
  if (person.organization?.city) return person.organization.city;
  return '';
}

module.exports = { searchLeads };
