/**
 * apollo.js — Apollo.io People Search API client.
 *
 * Uses the v1 mixed_people/search endpoint to find HVAC decision-makers
 * in Southwest Michigan. Each call targets one city to maximize relevance.
 */

const axios = require('axios');
const cfg = require('./config');

const BASE_URL = 'https://api.apollo.io/v1/mixed_people/search';

/**
 * Build the priority rank of a title (lower = higher priority).
 * Returns Infinity when the title is not in TARGET_TITLES.
 */
function titleRank(title) {
  if (!title) return Infinity;
  const t = title.toLowerCase();
  for (let i = 0; i < cfg.TARGET_TITLES.length; i++) {
    if (t.includes(cfg.TARGET_TITLES[i].toLowerCase())) return i;
  }
  return Infinity;
}

/**
 * Pick the best contact from an array of people returned for one organisation.
 * Preference: highest-priority title, then whoever has a phone number.
 */
function pickBestContact(people) {
  const withPhone = people.filter(
    (p) =>
      (p.sanitized_phone && p.sanitized_phone.trim()) ||
      (p.phone_numbers && p.phone_numbers.length > 0)
  );
  const pool = withPhone.length > 0 ? withPhone : people;
  return pool.reduce((best, p) => {
    return titleRank(p.title) < titleRank(best.title) ? p : best;
  }, pool[0]);
}

/**
 * Extract the best available phone number from a person record.
 */
function extractPhone(person) {
  if (person.sanitized_phone && person.sanitized_phone.trim()) {
    return person.sanitized_phone.trim();
  }
  if (person.phone_numbers && person.phone_numbers.length > 0) {
    // Prefer mobile > direct > work
    const priority = ['mobile', 'direct_phone', 'work_hq'];
    for (const type of priority) {
      const match = person.phone_numbers.find((pn) => pn.type === type);
      if (match && match.sanitized_number) return match.sanitized_number;
    }
    return person.phone_numbers[0].sanitized_number || '';
  }
  return '';
}

/**
 * Search Apollo for up to `limit` HVAC leads across all configured cities.
 * Returns an array of normalised lead objects.
 */
async function searchLeads(limit = cfg.MAX_LEADS_PER_RUN) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY is not set in environment variables.');

  const leads = [];
  const seen = new Set(); // deduplicate within a single Apollo run by org name

  for (const city of cfg.CITIES) {
    if (leads.length >= limit) break;

    const payload = {
      api_key: apiKey,
      q_organization_name: '',
      person_titles: cfg.TARGET_TITLES,
      organization_num_employees_ranges: [
        `${cfg.MIN_EMPLOYEES},${cfg.MAX_EMPLOYEES}`,
      ],
      person_locations: [`${city}, ${cfg.STATE}, ${cfg.COUNTRY}`],
      organization_industry_tag_ids: [], // Apollo resolves keyword searches
      q_keywords: cfg.INDUSTRY_KEYWORDS.join(' OR '),
      contact_email_status_v2: ['verified', 'likely_to_engage', 'guessed'],
      // Require a phone number to be present
      has_phone: true,
      page: 1,
      per_page: Math.min(25, limit - leads.length),
    };

    let response;
    try {
      response = await axios.post(BASE_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30_000,
      });
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || err.message;
      // Rate limit: back off and continue to the next city
      if (status === 429) {
        console.warn(`[Apollo] Rate limited on city "${city}" — skipping.`);
        await sleep(5000);
        continue;
      }
      throw new Error(`Apollo API error for city "${city}" (HTTP ${status}): ${msg}`);
    }

    const people = response.data?.people || [];
    if (people.length === 0) {
      console.log(`[Apollo] No results for city: ${city}`);
      continue;
    }

    // Group people by their organisation name, then pick the best contact per org
    const byOrg = new Map();
    for (const person of people) {
      const orgName = person.organization?.name || person.employment_history?.[0]?.organization_name || '';
      if (!orgName) continue;
      if (!byOrg.has(orgName)) byOrg.set(orgName, []);
      byOrg.get(orgName).push(person);
    }

    for (const [orgName, orgPeople] of byOrg) {
      if (leads.length >= limit) break;
      const normName = orgName.toLowerCase().trim();
      if (seen.has(normName)) continue;
      seen.add(normName);

      const person = pickBestContact(orgPeople);
      const phone = extractPhone(person);
      if (!phone) continue; // skip contacts with no reachable number

      leads.push({
        businessName: orgName,
        firstName: person.first_name || '',
        lastName: person.last_name || '',
        phone,
        city: person.city || city,
        website: person.organization?.website_url || '',
      });
    }

    console.log(`[Apollo] ${city}: found ${byOrg.size} orgs, kept ${leads.length} total so far.`);
    // Brief pause between city requests to stay within Apollo rate limits
    await sleep(1500);
  }

  return leads;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { searchLeads };
