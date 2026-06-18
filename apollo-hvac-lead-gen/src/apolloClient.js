// Thin wrapper around the two Apollo.io endpoints this workflow needs:
//   1. People Search  -- finds candidate decision-makers (no phone numbers)
//   2. People Match    -- enriches one person, optionally revealing a phone

const config = require('../config');

class ApolloError extends Error {}

function assertApiKey() {
  if (!config.apolloApiKey) {
    throw new ApolloError('APOLLO_API_KEY is not set. Add it to your .env file.');
  }
}

async function apolloPost(path, body) {
  assertApiKey();
  const res = await fetch(`${config.apolloBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apolloApiKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApolloError(
      `Apollo API error ${res.status} on ${path}: ${data.error || JSON.stringify(data)}`
    );
  }

  return data;
}

// Searches for candidate decision-makers at small HVAC/plumbing/mechanical
// companies in one Apollo location string (e.g. "Kalamazoo, MI").
// Returns Apollo's raw `people` array; phone numbers are NOT included yet.
async function searchPeople(locationLabel) {
  const body = {
    organization_locations: [locationLabel],
    organization_naics_codes: config.organizationNaicsCodes,
    q_organization_keyword_tags: config.organizationKeywordTags,
    organization_num_employees_ranges: [config.organizationEmployeeRange],
    person_titles: config.jobTitlesByPriority,
    per_page: config.searchResultsPerCity,
    page: 1,
  };

  const data = await apolloPost('/mixed_people/search', body);
  return data.people || [];
}

// Enriches a single person to try to obtain a direct/mobile phone number.
// Returns a phone number string, or null if none is available.
//
// NOTE ON CREDITS: every call here consumes 1 Apollo credit per matched
// person (0 if no match). This is why the workflow caps itself at
// maxNewLeadsPerRun candidates before calling this function.
//
// NOTE ON ASYNC REVEAL: Apollo's live mobile-number lookup is asynchronous.
// If APOLLO_PHONE_WEBHOOK_URL is configured, Apollo will POST the number
// there once found (handle that separately if you wire it up). Without a
// webhook, we only use whatever phone number Apollo can return immediately
// in the response below -- which is the majority of cases for contacts
// Apollo already has on file.
async function enrichPhone(person) {
  const body = {
    id: person.id,
    first_name: person.first_name,
    last_name: person.last_name,
    organization_name: person.organization && person.organization.name,
    reveal_phone_number: true,
  };
  if (config.apolloPhoneWebhookUrl) {
    body.webhook_url = config.apolloPhoneWebhookUrl;
  }

  const data = await apolloPost('/people/match', body);
  const phoneNumbers = (data.person && data.person.phone_numbers) || [];
  if (phoneNumbers.length === 0) return null;

  // Prefer a mobile/direct number over a generic switchboard line when Apollo
  // tells us the type; otherwise just take the first number returned.
  const preferred =
    phoneNumbers.find((p) => /mobile|direct/i.test(p.type || '')) || phoneNumbers[0];
  return preferred.sanitized_number || preferred.raw_number || null;
}

module.exports = { searchPeople, enrichPhone, ApolloError };
