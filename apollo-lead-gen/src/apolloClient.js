// ---------------------------------------------------------------------------
// Thin wrapper around the two Apollo.io endpoints this workflow needs:
//   1. POST /mixed_people/search  -- find people matching title + company filters
//   2. POST /people/match         -- enrich one person to reveal a phone number
//
// Phone numbers in Apollo are sometimes returned synchronously (e.g. a
// company's main line, or a previously-verified direct dial) and sometimes
// only available via an async webhook callback (freshly-looked-up personal
// mobile numbers). This client takes the pragmatic approach: it always asks
// for reveal_phone_number, and uses whatever phone Apollo hands back
// synchronously (direct dial > mobile > company main line). If you want
// guaranteed mobile-number reveals you can set WEBHOOK_URL in .env to a
// public endpoint and extend enrichPhone() to await that callback instead.
// ---------------------------------------------------------------------------
const BASE_URL = 'https://api.apollo.io/api/v1';

function apiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY is not set in the environment.');
  return key;
}

async function apolloPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Apollo API ${path} returned ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Searches for people with a single job title at small (1-25 employee)
// companies matching the industry keywords, biased toward the given cities.
async function searchPeopleByTitle({ title, cities, state, industryKeywords, employeeRange, page, perPage }) {
  const body = {
    person_titles: [title],
    include_similar_titles: false,
    organization_locations: [...cities, state],
    q_organization_keyword_tags: industryKeywords,
    organization_num_employees_ranges: [employeeRange],
    page,
    per_page: perPage,
  };
  const data = await apolloPost('/mixed_people/search', body);
  return {
    people: data.people || [],
    totalPages: data.pagination ? data.pagination.total_pages : 1,
  };
}

function extractBestPhone(person, matchData) {
  // matchData.phone_numbers looks like:
  // [{ raw_number, sanitized_number, type: 'mobile' | 'direct_dial' | 'work_hq' | 'home_phone' }]
  const numbers = (matchData && matchData.phone_numbers) || person.phone_numbers || [];
  const priority = ['mobile', 'direct_dial', 'work_hq', 'home_phone', 'other'];
  for (const type of priority) {
    const match = numbers.find((n) => n.type === type && n.sanitized_number);
    if (match) return match.sanitized_number;
  }
  if (numbers.length > 0 && numbers[0].sanitized_number) return numbers[0].sanitized_number;

  // Fall back to the company's main line if no person-level number was revealed.
  const org = (matchData && matchData.organization) || person.organization;
  return (org && (org.primary_phone?.number || org.phone)) || null;
}

// Enriches one person to attempt a phone reveal. Returns the best phone
// number string found, or null if Apollo has nothing on file.
async function enrichPhone(person) {
  const body = {
    id: person.id,
    reveal_phone_number: true,
  };
  if (process.env.WEBHOOK_URL) {
    body.webhook_url = process.env.WEBHOOK_URL;
  }
  const data = await apolloPost('/people/match', body);
  const matchedPerson = data.person || {};
  return extractBestPhone(person, matchedPerson);
}

module.exports = { searchPeopleByTitle, enrichPhone };
