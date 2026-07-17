'use strict';

// ─── Apollo.io API Client ─────────────────────────────────────
// Searches for HVAC decision-makers in SW Michigan using
// Apollo's People Search endpoint.

const axios = require('axios');
const config = require('./config');

const APOLLO_BASE = 'https://api.apollo.io/v1';

/**
 * Search Apollo for HVAC contacts matching our filters.
 * Returns an array of normalized lead objects (or throws on error).
 *
 * @param {string} apiKey   - APOLLO_API_KEY env var
 * @param {number} maxLeads - cap on how many to return (default 25)
 * @param {number} page     - pagination page (default 1)
 */
async function searchLeads(apiKey, maxLeads = 25, page = 1) {
  const payload = {
    api_key: apiKey,

    // Keyword search: Apollo matches against company name, title, bio
    q_keywords: config.apolloKeywords,

    // Target job titles (Apollo ORs these together)
    person_titles: config.jobTitles,

    // SW Michigan cities — Apollo ORs multiple locations
    person_locations: config.targetLocations,

    // Company size filter
    organization_num_employees_ranges: config.employeeRange,

    // Only return contacts that have at least one phone number.
    // Apollo honors this on paid plans; we also filter client-side below.
    has_phone_number: true,

    per_page: Math.min(maxLeads, 100), // Apollo max is 100 per page
    page,
  };

  let response;
  try {
    response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30_000,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error || err.message;
    throw new Error(`Apollo API error (HTTP ${status}): ${detail}`);
  }

  const people = response.data?.people ?? [];
  if (!Array.isArray(people)) {
    throw new Error('Unexpected Apollo response shape — "people" field missing.');
  }

  // Normalize each person into a flat lead object
  const leads = people
    .map(_normalize)
    .filter((lead) => lead !== null); // drop contacts with no phone after normalization

  return leads;
}

/**
 * Flatten one Apollo person object into the shape we save to Sheets.
 * Returns null if no usable phone number is found.
 */
function _normalize(person) {
  const phone = _bestPhone(person);
  if (!phone) return null;

  const orgName = person.organization?.name
    ?? person.employment_history?.[0]?.organization_name
    ?? '';

  const city =
    person.city ||
    person.organization?.city ||
    '';

  const website =
    person.organization?.website_url ||
    person.organization?.primary_domain ||
    '';

  return {
    firstName: person.first_name ?? '',
    lastName: person.last_name ?? '',
    businessName: orgName.trim(),
    phone,
    city,
    website: _cleanUrl(website),
  };
}

/**
 * Pick the best available phone number from an Apollo person record.
 * Priority: mobile → direct → any person phone → org primary phone.
 */
function _bestPhone(person) {
  const nums = person.phone_numbers ?? [];

  if (nums.length > 0) {
    const mobile = nums.find((n) => n.type === 'mobile');
    if (mobile) return _formatPhone(mobile.sanitized_number || mobile.raw_number);

    const direct = nums.find((n) => n.type === 'direct');
    if (direct) return _formatPhone(direct.sanitized_number || direct.raw_number);

    const first = nums[0];
    return _formatPhone(first.sanitized_number || first.raw_number);
  }

  const orgPhone = person.organization?.primary_phone?.number;
  if (orgPhone) return _formatPhone(orgPhone);

  return null;
}

function _formatPhone(raw) {
  if (!raw) return null;
  // Strip everything except digits
  const digits = raw.replace(/\D/g, '');
  // US numbers: strip leading 1 if 11 digits
  const core = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (core.length !== 10) return null;
  return `(${core.slice(0, 3)}) ${core.slice(3, 6)}-${core.slice(6)}`;
}

function _cleanUrl(url) {
  if (!url) return '';
  if (!url.startsWith('http')) return `https://${url}`;
  return url;
}

module.exports = { searchLeads };
