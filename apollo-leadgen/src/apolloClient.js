const axios = require('axios');
const config = require('./config');

const http = axios.create({
  baseURL: config.apollo.baseUrl,
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': config.apollo.apiKey,
  },
});

// Index a title's priority so we can sort multi-title search results.
// Lower number = higher priority. Unknown titles sort last.
function titleRank(title = '') {
  const idx = config.apollo.titlesByPriority.findIndex(
    (t) => title.toLowerCase().includes(t.toLowerCase())
  );
  return idx === -1 ? config.apollo.titlesByPriority.length : idx;
}

// Searches Apollo's People API for decision-makers at small HVAC/plumbing/
// mechanical companies in a given city. Does NOT return phone numbers --
// Apollo's search endpoint intentionally withholds contact details. Phone
// numbers are fetched separately via enrichPersonPhone().
async function searchPeopleInCity(city, perPage) {
  const body = {
    person_titles: config.apollo.titlesByPriority,
    person_locations: [city],
    organization_locations: config.apollo.organizationLocations,
    q_organization_keyword_tags: config.apollo.industryKeywords,
    organization_num_employees_ranges: config.apollo.employeeRanges,
    per_page: perPage,
    page: 1,
  };

  const { data } = await http.post('/mixed_people/search', body);
  const people = data.people || [];

  return people
    .map((p) => ({ ...p, _titleRank: titleRank(p.title) }))
    .sort((a, b) => a._titleRank - b._titleRank);
}

// Reveals a single person's phone number. Apollo bills "mobile/phone
// credits" for this call, so it's only invoked for candidates that survived
// the search + dedup filtering, not for every raw search hit.
//
// Note: Apollo can deliver freshly-discovered numbers asynchronously via a
// webhook for some account tiers. This implementation reads the
// synchronous `phone_numbers` field on the match response, which covers
// numbers already present in Apollo's index -- the common case for
// established small businesses. If your plan only supports the async
// webhook flow, you'll need to add a webhook receiver and look up results
// there instead.
async function enrichPersonPhone(personId) {
  const { data } = await http.post('/people/match', {
    id: personId,
    reveal_phone_number: true,
  });

  const person = data.person || {};
  const phones = person.phone_numbers || [];
  const best = phones.find((p) => p.sanitized_number) || phones[0];

  return best ? best.sanitized_number || best.raw_number : null;
}

module.exports = { searchPeopleInCity, enrichPersonPhone };
