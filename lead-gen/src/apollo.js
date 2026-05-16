const axios = require('axios');
const config = require('./config');

const client = axios.create({
  baseURL: config.apollo.baseUrl,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
  timeout: 30000,
});

/**
 * Search Apollo.io for people matching our HVAC criteria in a given city.
 * We request the max page size (100) so we can filter aggressively and
 * still end up with enough results after removing contacts with no phone.
 */
async function searchCity(city, page = 1) {
  const payload = {
    api_key: config.apollo.apiKey,
    // Target decision-maker titles in priority order
    person_titles: config.search.jobTitles,
    // Narrow both the person's location and their company's location to the city
    person_locations: [city],
    organization_locations: [city],
    // Industry match via keyword tags
    q_organization_keyword_tags: config.search.industryKeywords,
    // Owner-operated businesses: 1–25 employees
    organization_num_employees_ranges: [config.search.employeeRange],
    per_page: 100,
    page,
  };

  const response = await client.post('/mixed_people/search', payload);
  return response.data;
}

/**
 * Pick the best available phone number from an Apollo person record.
 * Priority: mobile → direct_phone → any phone number in the array.
 */
function getBestPhone(person) {
  if (person.mobile_phone) return person.mobile_phone;
  if (person.phone) return person.phone;

  const nums = person.phone_numbers || [];
  if (nums.length === 0) return null;

  const mobile = nums.find((n) => n.type === 'mobile');
  if (mobile) return mobile.raw_number || mobile.sanitized_number || null;

  const direct = nums.find((n) => n.type === 'direct_phone');
  if (direct) return direct.raw_number || direct.sanitized_number || null;

  return nums[0].raw_number || nums[0].sanitized_number || null;
}

/**
 * Map a raw Apollo person object to the flat shape our workflow uses.
 * Returns null if the contact has no phone number (per requirements).
 */
function mapContact(person) {
  const phone = getBestPhone(person);
  if (!phone) return null;

  const businessName = person.organization?.name || '';
  if (!businessName) return null;

  const city =
    person.city ||
    person.organization?.city ||
    '';

  const website = person.organization?.website_url || '';

  return {
    businessName,
    firstName: person.first_name || '',
    lastName: person.last_name || '',
    phone,
    city,
    website,
    // Preserve Apollo title so we can sort by priority later
    _title: (person.title || '').toLowerCase(),
  };
}

/**
 * Sort contacts so Owner > President > Founder > Co-Founder > GM.
 * Contacts with titles not in the priority list sink to the bottom.
 */
function sortByTitlePriority(contacts) {
  const priority = config.search.jobTitles.map((t) => t.toLowerCase());
  return contacts.sort((a, b) => {
    const ai = priority.findIndex((p) => a._title.includes(p));
    const bi = priority.findIndex((p) => b._title.includes(p));
    const aRank = ai === -1 ? priority.length : ai;
    const bRank = bi === -1 ? priority.length : bi;
    return aRank - bRank;
  });
}

/**
 * Fetch up to `limit` unique HVAC contacts across all target cities.
 * Iterates through each city and paginates if needed.
 *
 * @param {number} limit   Maximum contacts to return
 * @param {Set}    skipSet Set of lowercase business names already in the sheet
 * @returns {Promise<Array>}
 */
async function fetchLeads(limit, skipSet = new Set()) {
  const collected = [];
  // Track businesses seen in this batch to avoid intra-batch dupes
  const seenThisRun = new Set([...skipSet]);

  for (const city of config.search.cities) {
    if (collected.length >= limit) break;

    let page = 1;
    let hasMore = true;

    while (hasMore && collected.length < limit) {
      console.log(`  Apollo search: ${city} (page ${page})`);

      let data;
      try {
        data = await searchCity(city, page);
      } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.message || err.message;
        console.error(`  Apollo error for ${city} page ${page}: [${status}] ${msg}`);
        break;
      }

      const people = data.people || [];
      const totalPages = data.pagination?.total_pages || 1;

      for (const person of people) {
        if (collected.length >= limit) break;

        const contact = mapContact(person);
        if (!contact) continue;

        const key = contact.businessName.toLowerCase().trim();
        if (seenThisRun.has(key)) continue;

        seenThisRun.add(key);
        collected.push(contact);
      }

      hasMore = page < totalPages && people.length > 0;
      page++;

      // Polite pause between paginated requests
      if (hasMore) await sleep(600);
    }

    // Pause between city searches to avoid rate limiting
    await sleep(800);
  }

  return sortByTitlePriority(collected).slice(0, limit);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Quick connectivity test — verifies the API key is valid.
 */
async function testConnection() {
  const payload = {
    api_key: config.apollo.apiKey,
    person_titles: ['Owner'],
    person_locations: ['Kalamazoo, Michigan'],
    q_organization_keyword_tags: ['hvac'],
    per_page: 1,
    page: 1,
  };
  const response = await client.post('/mixed_people/search', payload);
  return response.status === 200;
}

module.exports = { fetchLeads, testConnection };
