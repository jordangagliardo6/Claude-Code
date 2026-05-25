const axios = require('axios');
const config = require('./config');

/**
 * Search Apollo.io for HVAC contacts in Southwest Michigan.
 * Returns an array of normalized lead objects.
 */
async function searchLeads(maxResults = 25) {
  if (!config.apollo.apiKey) {
    throw new Error('APOLLO_API_KEY is not set in environment variables.');
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Key': config.apollo.apiKey,
  };

  // Apollo people search endpoint
  const url = `${config.apollo.baseUrl}/mixed_people/search`;

  // Build the request payload
  const payload = {
    api_key: config.apollo.apiKey,
    q_organization_industries: config.TARGET_INDUSTRIES,
    person_titles: config.TARGET_TITLES,
    // Michigan state filter
    person_locations: ['Michigan, United States'],
    organization_locations: ['Michigan, United States'],
    // Company size 1–25 employees
    organization_num_employees_ranges: ['1,25'],
    // Only return contacts that have a phone number
    contact_email_status: [],
    // Sort by relevance
    sort_by_field: 'recommendations_score',
    sort_ascending: false,
    page: 1,
    per_page: Math.min(maxResults, 100),
    // Fields to return
    contact_phone_numbers: true,
  };

  console.log(`[Apollo] Searching for up to ${maxResults} HVAC leads in Southwest Michigan...`);

  let response;
  try {
    response = await axios.post(url, payload, { headers });
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    throw new Error(`Apollo API request failed: ${msg}`);
  }

  const people = response.data?.people || [];
  console.log(`[Apollo] Raw results returned: ${people.length}`);

  // Filter to only Southwest Michigan cities and contacts with phone numbers
  const swMichiganCitiesLower = config.TARGET_CITIES.map(c => c.toLowerCase());

  const filtered = people.filter(person => {
    const city = (person.city || person.organization?.city || '').toLowerCase();
    const state = (person.state || person.organization?.state || '').toLowerCase();
    const hasPhone = hasPhoneNumber(person);

    // Must be in Michigan
    if (!state.includes('michigan') && !state.includes('mi')) return false;

    // Must have a phone number
    if (!hasPhone) return false;

    // Prefer Southwest Michigan cities but don't hard-exclude — Apollo's geo
    // filtering is imprecise so we cast a wider net and flag city in output
    return true;
  });

  // Prioritize Southwest Michigan cities first
  filtered.sort((a, b) => {
    const cityA = (a.city || a.organization?.city || '').toLowerCase();
    const cityB = (b.city || b.organization?.city || '').toLowerCase();
    const inSwMiA = swMichiganCitiesLower.some(c => cityA.includes(c)) ? 0 : 1;
    const inSwMiB = swMichiganCitiesLower.some(c => cityB.includes(c)) ? 0 : 1;
    return inSwMiA - inSwMiB;
  });

  // Also prioritize by title order (Owner > President > Founder > ...)
  const titlePriority = config.TARGET_TITLES.map(t => t.toLowerCase());
  filtered.sort((a, b) => {
    const titleA = (a.title || '').toLowerCase();
    const titleB = (b.title || '').toLowerCase();
    const priA = titlePriority.findIndex(t => titleA.includes(t));
    const priB = titlePriority.findIndex(t => titleB.includes(t));
    return (priA === -1 ? 99 : priA) - (priB === -1 ? 99 : priB);
  });

  const leads = filtered.slice(0, maxResults).map(normalizeLead);

  console.log(`[Apollo] Returning ${leads.length} qualified leads after filtering.`);
  return leads;
}

/**
 * Returns true if the Apollo person record has any usable phone number.
 */
function hasPhoneNumber(person) {
  if (person.phone_numbers && person.phone_numbers.length > 0) return true;
  if (person.mobile_phone) return true;
  if (person.organization_phone) return true;
  if (person.sanitized_phone) return true;
  return false;
}

/**
 * Extract the best available phone number from an Apollo person record.
 * Priority: direct/mobile > sanitized > organization phone.
 */
function extractPhone(person) {
  // phone_numbers array may contain type: 'direct', 'mobile', 'work', etc.
  if (person.phone_numbers && person.phone_numbers.length > 0) {
    // Prefer direct or mobile
    const direct = person.phone_numbers.find(p =>
      ['direct', 'mobile', 'personal'].includes(p.type?.toLowerCase())
    );
    if (direct) return formatPhone(direct.raw_number || direct.sanitized_number);

    // Fall back to first available
    const first = person.phone_numbers[0];
    return formatPhone(first.raw_number || first.sanitized_number);
  }

  if (person.mobile_phone) return formatPhone(person.mobile_phone);
  if (person.sanitized_phone) return formatPhone(person.sanitized_phone);
  if (person.organization_phone) return formatPhone(person.organization_phone);

  return '';
}

/**
 * Normalize a US phone number to (XXX) XXX-XXXX format.
 */
function formatPhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  // Strip leading 1 for US numbers
  const local = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return raw; // Return as-is if format is unexpected
}

/**
 * Normalize a raw Apollo person record into the lead schema used by the workflow.
 */
function normalizeLead(person) {
  const org = person.organization || {};
  return {
    businessName: org.name || person.organization_name || '',
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone: extractPhone(person),
    city: person.city || org.city || '',
    website: org.website_url || person.website_url || '',
    title: person.title || '',
  };
}

module.exports = { searchLeads };
