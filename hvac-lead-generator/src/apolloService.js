'use strict';
const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

// ─── PHONE EXTRACTION ────────────────────────────────────────────────────────

// Returns the best available phone number for a contact.
// Apollo returns an array of phone objects with type labels ("mobile", "work", etc.).
// We prefer mobile > direct > any verified > any, matching what a caller would want.
const PHONE_PRIORITY = ['mobile', 'direct', 'work'];

function pickBestPhone(phoneNumbers = []) {
  if (!phoneNumbers.length) return null;

  for (const preferredType of PHONE_PRIORITY) {
    const match = phoneNumbers.find(
      (p) => p.status === 'verified' && p.type === preferredType
    );
    if (match) return match.sanitized_number || match.number;
  }

  // Fall back to any verified number before giving up.
  const anyVerified = phoneNumbers.find((p) => p.status === 'verified');
  if (anyVerified) return anyVerified.sanitized_number || anyVerified.number;

  // Last resort: unverified but present.
  const first = phoneNumbers[0];
  return first.sanitized_number || first.number || null;
}

// ─── RESULT NORMALIZATION ────────────────────────────────────────────────────

// Converts a raw Apollo person object into the flat shape the workflow needs.
function normalizePerson(person) {
  const phone = pickBestPhone(person.phone_numbers);

  // Apollo can return the city at the person level or inside the org object.
  const city =
    person.city ||
    person.organization?.city ||
    '';

  const website =
    person.organization?.website_url ||
    person.organization?.primary_domain ||
    '';

  return {
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    businessName: person.organization_name || person.organization?.name || '',
    phone,
    city,
    website,
  };
}

// ─── API CALL ────────────────────────────────────────────────────────────────

// Fetches one page of HVAC decision-makers from Apollo's People Search endpoint.
// Apollo v1 requires the API key as a header; body carries search filters.
async function fetchLeads(page = 1) {
  if (!config.apolloApiKey) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }

  const payload = {
    // Titles in order of priority — Apollo weights earlier entries higher.
    person_titles: config.targetTitles,

    // Restrict to the Southwest Michigan cities listed in config.js.
    person_locations: config.targetCities,

    // "1,25" means 1–25 employees — owner-operated businesses only.
    organization_num_employees_ranges: [config.employeeRange],

    // Keyword filter to narrow to HVAC/plumbing/mechanical orgs.
    // Apollo searches company names, descriptions, and industry tags.
    q_keywords: config.industryKeywords.join(' OR '),

    // Only return contacts with at least one phone number on file.
    // Contacts without any phone are worthless for outreach and excluded per spec.
    has_phone_number: true,

    per_page: config.maxLeadsPerRun,
    page,
  };

  logger.info('Calling Apollo People Search', { page, perPage: config.maxLeadsPerRun });

  const response = await axios.post(
    `${config.apolloBaseUrl}/mixed_people/search`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': config.apolloApiKey,
      },
      timeout: 30_000,
    }
  );

  const { people = [], pagination = {} } = response.data;
  logger.info(`Apollo returned ${people.length} people (page ${page} of ${pagination.total_pages ?? '?'})`);

  return people;
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

// Returns an array of normalized lead objects, already filtered to those with
// a resolvable phone number. The caller is responsible for duplicate checking.
async function searchLeads() {
  const rawPeople = await fetchLeads(1);

  const leads = rawPeople
    .map(normalizePerson)
    .filter((lead) => {
      if (!lead.phone) {
        logger.warn(`Skipping "${lead.businessName}" — no usable phone number`);
        return false;
      }
      if (!lead.businessName) {
        logger.warn('Skipping record with no business name');
        return false;
      }
      return true;
    });

  logger.info(`${leads.length} usable leads after normalization and phone filter`);
  return leads;
}

module.exports = { searchLeads };
