const axios = require('axios');
const { config } = require('./config');

// Searches Apollo for HVAC decision-makers in SW Michigan.
// Returns an array of normalized lead objects, each guaranteed to have a phone number.
async function searchLeads() {
  const url = `${config.apollo.baseUrl}/mixed_people/search`;

  const payload = {
    api_key: config.apollo.apiKey,
    // Target titles in priority order
    person_titles: config.apollo.targetTitles,
    // Match people located in the target SW Michigan cities
    person_locations: config.apollo.cities,
    // HVAC industry keyword tags on their employer
    q_organization_keyword_tags: config.apollo.industryTags,
    // 1–25 employees: owner-operated businesses
    organization_num_employees_ranges: config.apollo.employeeRanges,
    // Michigan state
    organization_locations: ['Michigan, United States'],
    per_page: Math.min(config.apollo.maxLeadsPerRun * 2, 100), // fetch extra to account for phone-less results
    page: 1,
  };

  let response;
  try {
    response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    throw new Error(`Apollo API request failed: ${detail}`);
  }

  const people = response.data?.people || [];

  if (people.length === 0) {
    console.log('[Apollo] Search returned 0 results.');
    return [];
  }

  console.log(`[Apollo] Fetched ${people.length} raw results.`);

  const leads = [];
  for (const person of people) {
    const phone = extractPhone(person);
    if (!phone) continue; // skip contacts with no phone number

    leads.push({
      businessName: person.organization_name || person.employment_history?.[0]?.organization_name || '',
      firstName: person.first_name || '',
      lastName: person.last_name || '',
      phone,
      city: person.city || '',
      website: person.organization?.website_url || person.website_url || '',
    });
  }

  console.log(`[Apollo] ${leads.length} leads have phone numbers.`);

  // Honour the per-run cap
  return leads.slice(0, config.apollo.maxLeadsPerRun);
}

// Returns the best available phone number for a person record.
// Priority: direct_phone → mobile_phone → any work_hq → any other number.
function extractPhone(person) {
  const numbers = person.phone_numbers;
  if (!numbers || numbers.length === 0) return null;

  const priority = ['direct_phone', 'mobile_phone', 'work_hq', 'work', 'other'];
  for (const type of priority) {
    const match = numbers.find((n) => n.type === type && n.raw_number);
    if (match) return match.raw_number;
  }

  // Fall back to whatever is first
  return numbers[0]?.raw_number || null;
}

module.exports = { searchLeads };
