const axios = require('axios');
const config = require('./config');

/**
 * Search Apollo.io for HVAC contacts in Southwest Michigan.
 * Returns up to maxLeadsPerRun contacts with phone numbers.
 */
async function searchLeads() {
  const { apollo } = config;

  if (!apollo.apiKey) {
    throw new Error('APOLLO_API_KEY is not set in your .env file.');
  }

  // Build a combined location string — Apollo accepts city+state or state-level
  // We search at the state level and filter by city afterward
  const locationFilters = [`${apollo.targetState}, ${apollo.targetCountry}`];

  // Apollo people search payload
  const payload = {
    api_key: apollo.apiKey,
    per_page: apollo.maxLeadsPerRun * 3, // Fetch extra to allow filtering for phone numbers
    page: 1,
    person_titles: apollo.jobTitles,
    organization_locations: locationFilters,
    organization_num_employees_ranges: [`${apollo.minEmployees},${apollo.maxEmployees}`],
    // Keyword tags filter to HVAC/plumbing/mechanical industries
    q_organization_keyword_tags: apollo.industryKeywords,
    // Only return contacts with at least one phone number
    // Apollo doesn't guarantee phone data — we filter in post-processing
    contact_email_status: ['likely_to_engage', 'verified', 'unknown'],
  };

  console.log(`[Apollo] Searching for HVAC leads in ${apollo.targetState}...`);

  let response;
  try {
    response = await axios.post(
      `${apollo.baseUrl}/mixed_people/search`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 30000,
      }
    );
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;
      if (status === 401 || status === 403) {
        throw new Error(`Apollo API authentication failed (${status}). Check your APOLLO_API_KEY.`);
      }
      if (status === 429) {
        throw new Error('Apollo API rate limit reached. Try again later or upgrade your plan.');
      }
      throw new Error(`Apollo API error ${status}: ${JSON.stringify(data)}`);
    }
    throw new Error(`Apollo API request failed: ${err.message}`);
  }

  const people = response.data?.people || [];
  console.log(`[Apollo] Raw results: ${people.length} contacts returned.`);

  if (people.length === 0) {
    return [];
  }

  // Normalize and filter results
  const leads = [];
  const targetCitiesLower = apollo.targetCities.map((c) => c.toLowerCase());

  for (const person of people) {
    const lead = extractLeadData(person);
    if (!lead) continue;

    // Skip if no phone number at all
    if (!lead.phone) continue;

    // Filter to Southwest Michigan cities (or accept if city is blank — keep for now)
    const cityLower = (lead.city || '').toLowerCase();
    const cityMatch =
      cityLower === '' ||
      targetCitiesLower.some(
        (target) => cityLower.includes(target) || target.includes(cityLower)
      );

    if (!cityMatch) continue;

    leads.push(lead);
    if (leads.length >= apollo.maxLeadsPerRun) break;
  }

  console.log(`[Apollo] Filtered to ${leads.length} leads with phone numbers in target cities.`);
  return leads;
}

/**
 * Pull the most useful fields from a raw Apollo person record.
 * Returns null if the record is missing critical data.
 */
function extractLeadData(person) {
  const org = person.organization || {};

  const firstName = (person.first_name || '').trim();
  const lastName = (person.last_name || '').trim();

  // Business name falls back to organization name
  const businessName =
    (org.name || person.organization_name || '').trim();

  if (!businessName) return null;

  // Phone number — prefer mobile, then direct, then organization main
  const phone = pickBestPhone(person.phone_numbers, org.primary_phone);

  // City — person city is more accurate than org city for location filtering
  const city =
    (person.city || org.city || '').trim();

  const website = (org.website_url || person.website_url || '').trim();

  return {
    businessName,
    firstName,
    lastName,
    phone,
    city,
    website,
  };
}

/**
 * Choose the best phone number from Apollo's phone_numbers array.
 * Priority: mobile > direct_phone > work > any
 */
function pickBestPhone(phoneNumbers, orgPhone) {
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    return orgPhone || null;
  }

  const priority = ['mobile', 'direct_phone', 'work', 'other'];

  for (const type of priority) {
    const match = phoneNumbers.find(
      (p) => p.type === type && p.sanitized_number
    );
    if (match) return match.sanitized_number;
  }

  // Fall back to any available number
  const any = phoneNumbers.find((p) => p.sanitized_number);
  return any ? any.sanitized_number : orgPhone || null;
}

module.exports = { searchLeads };
