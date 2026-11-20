const axios = require('axios');
const config = require('./config');

/**
 * Searches Apollo.io for HVAC contacts in SW Michigan.
 * Returns an array of normalized lead objects.
 */
async function fetchLeads(maxLeads = 25) {
  if (!config.apollo.apiKey) {
    throw new Error('APOLLO_API_KEY is not set in environment variables.');
  }

  const allLeads = [];
  let page = 1;
  const perPage = Math.min(maxLeads, 25); // Apollo max per_page is 25 on most plans

  while (allLeads.length < maxLeads) {
    const needed = maxLeads - allLeads.length;
    const pageSize = Math.min(perPage, needed);

    console.log(`[Apollo] Fetching page ${page} (${pageSize} results requested)...`);

    let response;
    try {
      response = await axios.post(
        `${config.apollo.baseUrl}/mixed_people/search`,
        {
          api_key: config.apollo.apiKey,
          person_titles: config.targetTitles,
          // Target Michigan with SW Michigan city list for person location
          person_locations: config.swMichiganCities.map(c => `${c}, Michigan, United States`),
          organization_locations: ['Michigan, United States'],
          q_organization_keyword_tags: config.targetIndustries,
          organization_num_employees_ranges: ['1,25'],
          contact_phone_status_cd: ['ready', 'has_phone'],
          page,
          per_page: pageSize,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000,
        }
      );
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;
      throw new Error(`Apollo API error (HTTP ${status || 'unknown'}): ${msg}`);
    }

    const people = response.data?.people || [];
    console.log(`[Apollo] Page ${page}: got ${people.length} results.`);

    if (people.length === 0) break; // No more results

    for (const person of people) {
      const lead = normalizeLead(person);
      if (lead) allLeads.push(lead);
      if (allLeads.length >= maxLeads) break;
    }

    // Apollo pagination: check if there are more pages
    const totalPages = response.data?.pagination?.total_pages || 1;
    if (page >= totalPages) break;

    page++;

    // Brief pause to respect API rate limits
    await sleep(500);
  }

  console.log(`[Apollo] Total valid leads fetched: ${allLeads.length}`);
  return allLeads;
}

/**
 * Extracts and normalizes fields from an Apollo person record.
 * Returns null if the contact has no phone number.
 */
function normalizeLead(person) {
  // Require at least one phone number
  const phones = person.phone_numbers || [];
  const phone = pickBestPhone(phones);
  if (!phone) return null;

  const org = person.organization || {};

  // Prefer the contact's city; fall back to org city
  const city = person.city || org.city || '';

  return {
    businessName: org.name || '',
    ownerFirst: person.first_name || '',
    ownerLast: person.last_name || '',
    phone,
    city,
    website: cleanUrl(org.website_url || ''),
  };
}

/**
 * Picks the best phone number from Apollo's phone_numbers array.
 * Priority: mobile > direct_phone > work > any available.
 */
function pickBestPhone(phones) {
  if (!phones || phones.length === 0) return null;

  const priority = ['mobile', 'direct_phone', 'work', 'other'];
  for (const type of priority) {
    const match = phones.find(p => p.type === type && p.sanitized_number);
    if (match) return match.sanitized_number;
  }

  // Fall back to whatever has a sanitized number
  const any = phones.find(p => p.sanitized_number);
  return any ? any.sanitized_number : null;
}

function cleanUrl(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { fetchLeads };
