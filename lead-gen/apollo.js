'use strict';

const axios = require('axios');

const APOLLO_BASE = 'https://api.apollo.io/v1';

/**
 * Search Apollo.io for HVAC contacts matching the given config.
 *
 * Fetches up to `fetchLimit` contacts, then filters to those with a phone
 * number. Returns an array of normalized lead objects.
 *
 * @param {object} config  - Values from config.js
 * @param {number} fetchLimit - How many candidates to pull before filtering
 * @returns {Promise<Array<{businessName, firstName, lastName, phone, city, website}>>}
 */
async function searchLeads(config, fetchLimit = 75) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY environment variable is not set');

  const results = [];
  let page = 1;
  const perPage = 25; // Apollo's max per page on free/basic tiers

  while (results.length < fetchLimit) {
    const payload = {
      api_key: apiKey,
      per_page: perPage,
      page,
      person_titles: config.JOB_TITLE_PRIORITY,
      q_organization_keyword_tags: config.INDUSTRIES,
      organization_locations: config.CITIES,
      organization_num_employees_ranges: config.EMPLOYEE_RANGES,
    };

    let response;
    try {
      response = await axios.post(`${APOLLO_BASE}/mixed_people/search`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 30000,
      });
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.message || err.response?.data?.error || err.message;
      throw new Error(`Apollo API error (HTTP ${status}): ${detail}`);
    }

    const people = response.data?.people ?? [];
    const pagination = response.data?.pagination ?? {};

    if (people.length === 0) break;

    for (const person of people) {
      const phone = extractPhone(person);
      if (!phone) continue; // skip contacts with no phone

      results.push({
        businessName: (person.organization?.name || '').trim(),
        firstName: (person.first_name || '').trim(),
        lastName: (person.last_name || '').trim(),
        phone,
        city: (person.city || person.organization?.city || '').trim(),
        website: (person.organization?.website_url || '').trim(),
        // titleRank is used for priority-sorting when we have more than MAX_LEADS_PER_RUN
        titleRank: rankTitle(person.title, config.JOB_TITLE_PRIORITY),
      });

      if (results.length >= fetchLimit) break;
    }

    if (!pagination.has_more || people.length < perPage) break;
    page++;
  }

  // Sort by title priority (Owner first, etc.) before returning
  results.sort((a, b) => a.titleRank - b.titleRank);

  return results;
}

/**
 * Return the best available phone number from an Apollo contact object.
 * Priority: mobile phone > direct line > first available number.
 */
function extractPhone(person) {
  if (person.mobile_phone) return person.mobile_phone;

  const numbers = person.phone_numbers;
  if (!Array.isArray(numbers) || numbers.length === 0) return null;

  const mobile = numbers.find(p => p.type === 'mobile');
  if (mobile?.sanitized_number) return mobile.sanitized_number;
  if (mobile?.raw_number) return mobile.raw_number;

  const direct = numbers.find(p => p.type === 'direct');
  if (direct?.sanitized_number) return direct.sanitized_number;
  if (direct?.raw_number) return direct.raw_number;

  // Fall back to whatever is first
  return numbers[0].sanitized_number || numbers[0].raw_number || null;
}

/**
 * Return a sort key for a job title against the priority list.
 * Lower index = higher priority. Unrecognized titles sort to the end.
 */
function rankTitle(title = '', priorityList) {
  const t = title.toLowerCase();
  const idx = priorityList.findIndex(p => t.includes(p.toLowerCase()));
  return idx === -1 ? priorityList.length : idx;
}

module.exports = { searchLeads };
