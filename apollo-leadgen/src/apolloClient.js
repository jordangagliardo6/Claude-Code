/**
 * Thin client around the Apollo.io People Search + Match APIs.
 * Docs: https://docs.apollo.io/reference
 */

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

function getApiKey() {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    throw new Error('APOLLO_API_KEY is not set. Add it to your .env file.');
  }
  return apiKey;
}

async function apolloFetch(path, body) {
  const res = await fetch(`${APOLLO_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Apollo API request to ${path} failed: ${res.status} ${res.statusText} ${text}`);
  }

  return res.json();
}

/**
 * Search for people matching the given title/location/industry/size filters.
 * Returns Apollo's raw "people" array for a single city/title query.
 */
async function searchPeople({ city, state, titles, industryKeywords, employeeRanges, perPage }) {
  const body = {
    person_titles: titles,
    organization_locations: [city, state],
    organization_num_employees_ranges: employeeRanges,
    q_organization_keyword_tags: industryKeywords,
    page: 1,
    per_page: perPage,
  };

  const data = await apolloFetch('/mixed_people/search', body);
  return data.people || [];
}

/**
 * Reveal a contact's direct/mobile phone number. Apollo verifies phone
 * numbers asynchronously, so this only returns a number immediately if
 * Apollo already has a verified one cached; otherwise (when a webhook is
 * configured) the verified number arrives later via APOLLO_PHONE_WEBHOOK_URL.
 */
async function revealPhoneNumber(personId) {
  const webhookUrl = process.env.APOLLO_PHONE_WEBHOOK_URL || undefined;

  const data = await apolloFetch('/people/match', {
    id: personId,
    reveal_phone_number: true,
    webhook_url: webhookUrl,
  });

  return data.person || null;
}

module.exports = { searchPeople, revealPhoneNumber };
