// ─────────────────────────────────────────────────────────────────────────────
// apollo.js — Apollo.io API client
// Searches for HVAC decision-makers in Southwest Michigan cities and returns
// normalized lead objects ready to write to Google Sheets.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/v1';

// Titles that indicate a decision-maker (lower priority → higher index).
// We sort results so Owner/Founder contacts bubble up.
const TITLE_PRIORITY = ['owner', 'founder', 'co-founder', 'president', 'general manager'];

/**
 * Search Apollo.io for HVAC decision-makers in every configured city.
 * Stops collecting once maxLeadsPerRun is reached.
 *
 * @returns {Promise<Array>} Array of normalized lead objects (no duplicates within this batch).
 */
async function searchLeads() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }

  const leads = [];
  // Track business names within this batch to avoid intra-run duplicates.
  const seenThisRun = new Set();

  for (const city of config.cities) {
    if (leads.length >= config.maxLeadsPerRun) break;

    const needed = config.maxLeadsPerRun - leads.length;

    try {
      console.log(`  [Apollo] Searching: ${city} (need ${needed} more leads)`);

      const response = await axios.post(
        `${APOLLO_BASE}/mixed_people/search`,
        {
          api_key: apiKey,
          page: 1,
          per_page: Math.min(needed + 5, 25), // request a few extra to account for nulls
          person_titles: config.jobTitles,
          q_organization_keyword_tags: config.industries,
          person_locations: [city],
          organization_num_employees_ranges: [config.employeeRange],
          contact_phone_exists: true,
        },
        {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          timeout: 15000, // 15-second timeout per request
        }
      );

      const people = response.data?.people ?? [];
      console.log(`  [Apollo] ${people.length} raw contacts returned for ${city}`);

      // Sort by title priority so Owner/Founder contacts come first.
      people.sort((a, b) => {
        const rankA = getTitleRank(a.title);
        const rankB = getTitleRank(b.title);
        return rankA - rankB;
      });

      for (const person of people) {
        if (leads.length >= config.maxLeadsPerRun) break;

        const lead = normalizeLead(person);
        if (!lead) continue;

        const key = lead.businessName.toLowerCase();
        if (seenThisRun.has(key)) continue;

        seenThisRun.add(key);
        leads.push(lead);
      }
    } catch (err) {
      const status = err.response?.status;
      const msg    = err.response?.data?.message || err.message;

      if (status === 401) {
        // Bad API key — stop everything, no point checking other cities.
        throw new Error(`Apollo API key is invalid or expired. [401] ${msg}`);
      }

      if (status === 429) {
        console.warn(`  [Apollo] Rate-limited on ${city}. Skipping to next city.`);
      } else {
        console.error(`  [Apollo] Error for ${city}: [${status ?? 'network'}] ${msg}`);
      }
      // Continue to the next city on recoverable errors.
    }
  }

  return leads;
}

/**
 * Map an Apollo person object to a clean, flat lead record.
 *
 * @param {Object} person - Raw Apollo API person object
 * @returns {Object|null} Normalized lead, or null if required fields are missing
 */
function normalizeLead(person) {
  // Business name — prefer the live organization object, fall back to employment history
  const businessName = (
    person.organization?.name ||
    person.employment_history?.[0]?.organization_name ||
    ''
  ).trim();

  if (!businessName) return null;

  // Phone — prefer mobile, then direct, then any available number
  const phones = person.phone_numbers ?? [];
  const mobile  = phones.find((p) => p.type === 'mobile');
  const direct  = phones.find((p) => p.type === 'direct');
  const anyNum  = phones[0];
  const phone   = (mobile || direct || anyNum)?.sanitized_number ?? '';

  // Skip contacts with no phone at all
  if (!phone) return null;

  // City — prefer person-level, fall back to organization-level
  const city = (
    person.city ||
    person.location_city ||
    person.organization?.city ||
    ''
  ).trim();

  // Website — prefer full URL, fall back to primary domain
  const rawSite = person.organization?.website_url || person.organization?.primary_domain || '';
  const website = rawSite.trim();

  return {
    businessName,
    firstName : (person.first_name ?? '').trim(),
    lastName  : (person.last_name  ?? '').trim(),
    phone,
    city,
    website,
  };
}

/**
 * Return a sort index for a job title string (lower = higher priority).
 *
 * @param {string} title - Raw job title from Apollo
 * @returns {number}
 */
function getTitleRank(title) {
  if (!title) return TITLE_PRIORITY.length;
  const lower = title.toLowerCase();
  const idx = TITLE_PRIORITY.findIndex((t) => lower.includes(t));
  return idx === -1 ? TITLE_PRIORITY.length : idx;
}

/**
 * Quick connectivity check — fires a minimal search and confirms the API key works.
 * Used by setup-check.js.
 *
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function testConnection() {
  try {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) return { ok: false, message: 'APOLLO_API_KEY is not set' };

    const response = await axios.post(
      `${APOLLO_BASE}/mixed_people/search`,
      { api_key: apiKey, page: 1, per_page: 1, person_titles: ['owner'] },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );

    const total = response.data?.pagination?.total_entries ?? '?';
    return { ok: true, message: `Apollo responded OK (${total} total results available)` };
  } catch (err) {
    const status = err.response?.status;
    const msg    = err.response?.data?.message || err.message;
    return { ok: false, message: `[${status ?? 'network'}] ${msg}` };
  }
}

module.exports = { searchLeads, testConnection };
