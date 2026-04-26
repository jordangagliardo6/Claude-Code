/**
 * apollo.js — Apollo.io API integration.
 *
 * Handles searching for people, extracting structured lead data,
 * filtering by target city, and deduplicating by company.
 */

const axios  = require('axios');
const logger = require('./logger');
const config = require('./config');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

/**
 * Fetch one page of people results from Apollo.
 * @param {number} page - 1-based page number
 * @returns {object} Raw Apollo response (people[], pagination)
 */
async function searchLeads(page = 1) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set.');

  // Build a keyword query that covers all target industries.
  const industryKeywords = config.industries
    .map(i => (i.includes(' ') ? `"${i}"` : i))
    .join(' OR ');

  const body = {
    api_key: apiKey,
    q_keywords: industryKeywords,

    // Filter by decision-maker titles. Apollo does fuzzy matching.
    person_titles: config.jobTitles,

    // State-level location — we refine to city after receiving results.
    organization_locations: ['Michigan, United States'],
    person_locations: ['Michigan, United States'],

    // 1–25 employees (owner-operated small businesses).
    num_employees_ranges: config.employeeRange,

    page,
    per_page: 100, // Fetch more per page so city filtering leaves enough.
  };

  try {
    logger.info(`Apollo search — page ${page}...`);
    const response = await axios.post(
      `${APOLLO_BASE_URL}/mixed_people/search`,
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
        timeout: 30_000,
      }
    );
    return response.data;
  } catch (err) {
    const detail = err.response
      ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    throw new Error(`Apollo API request failed — ${detail}`);
  }
}

/**
 * Transform raw Apollo `people` records into clean lead objects.
 * Filters out records with no phone number and those outside target cities.
 *
 * @param {object} apolloData - Raw Apollo search response
 * @returns {Array<object>} Filtered, normalized leads
 */
function extractLeads(apolloData) {
  if (!apolloData.people?.length) return [];

  const leads = [];

  for (const person of apolloData.people) {
    // Skip anyone with no phone number at all.
    const phones = person.phone_numbers ?? [];
    const bestPhone = pickBestPhone(phones);
    if (!bestPhone) continue;

    const org  = person.organization ?? {};
    const city = org.city ?? person.city ?? '';

    // Only keep contacts in our Southwest Michigan target cities.
    if (!isInTargetArea(city)) continue;

    leads.push({
      businessName: org.name          ?? '',
      firstName:    person.first_name ?? '',
      lastName:     person.last_name  ?? '',
      phone:        bestPhone,
      city,
      website: normalizeUrl(org.website_url ?? ''),
      title:   person.title ?? '',
    });
  }

  return leads;
}

/**
 * When multiple contacts exist for the same company, keep only the one
 * with the highest-priority job title (lowest index in config.jobTitles).
 *
 * @param {Array<object>} leads
 * @returns {Array<object>}
 */
function deduplicateByCompany(leads) {
  const byCompany = new Map();

  for (const lead of leads) {
    const key = lead.businessName.toLowerCase().trim();
    if (!key) continue;

    if (!byCompany.has(key)) {
      byCompany.set(key, lead);
    } else {
      const existing = byCompany.get(key);
      if (titlePriority(lead.title) < titlePriority(existing.title)) {
        byCompany.set(key, lead);
      }
    }
  }

  return Array.from(byCompany.values());
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Choose the best available phone number from an Apollo phone_numbers array.
 * Priority: mobile > direct > work > any.
 */
function pickBestPhone(phones) {
  const priority = [
    'mobile',
    'direct_phone',
    'work_direct_phone',
    'work',
    'home',
    'other',
  ];

  for (const type of priority) {
    const match = phones.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }

  // Fallback: any number with a sanitized value.
  const any = phones.find(p => p.sanitized_number);
  return any?.sanitized_number ?? null;
}

/**
 * Case-insensitive check whether `city` matches any of our target cities.
 * Handles partial matches (e.g., "St. Joseph Township" still matches "St. Joseph").
 */
function isInTargetArea(city) {
  if (!city) return false;
  const normalized = city.toLowerCase();
  return config.targetCities.some(target =>
    normalized.includes(target.toLowerCase()) ||
    target.toLowerCase().includes(normalized)
  );
}

/** Lower index in config.jobTitles = higher priority (smaller number). */
function titlePriority(title) {
  if (!title) return 999;
  const lower = title.toLowerCase();
  const idx = config.jobTitles.findIndex(t => lower.includes(t.toLowerCase()));
  return idx === -1 ? 999 : idx;
}

/** Ensure website URLs include a scheme so they're clickable in Sheets. */
function normalizeUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://${url}`;
}

module.exports = { searchLeads, extractLeads, deduplicateByCompany };
