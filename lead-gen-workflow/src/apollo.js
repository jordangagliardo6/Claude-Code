/**
 * Apollo.io API Client
 *
 * Searches for HVAC decision-makers in Southwest Michigan.
 * To add more cities, edit SW_MICHIGAN_CITIES below.
 * To change industries or titles, edit INDUSTRIES and JOB_TITLES below.
 */

'use strict';

const axios = require('axios');
const logger = require('./logger');

const APOLLO_BASE_URL = 'https://api.apollo.io/v1';

// ─── Configurable search parameters ──────────────────────────────────────────

const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Apollo keyword tags for filtering industries
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
];

// Titles searched in priority order; Apollo will return any match
const JOB_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Employee range: 1–25 (owner-operated small businesses)
const EMPLOYEE_RANGE = ['1,25'];

// ─── API client ───────────────────────────────────────────────────────────────

class ApolloClient {
  constructor(apiKey) {
    if (!apiKey) throw new Error('APOLLO_API_KEY is required');
    this.apiKey = apiKey;
    this.http = axios.create({
      baseURL: APOLLO_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30000,
    });
  }

  /**
   * Search Apollo for HVAC contacts. Returns an array of normalized lead objects.
   * @param {number} maxResults  Maximum number of leads to return (default 25)
   * @param {number} page        Page number for pagination (default 1)
   */
  async searchLeads(maxResults = 25, page = 1) {
    const payload = {
      api_key: this.apiKey,

      // Target cities — Apollo accepts city/state strings under organization_locations
      organization_locations: SW_MICHIGAN_CITIES,

      // Industry filtering via keyword tags
      q_organization_keyword_tags: INDUSTRY_KEYWORDS,

      // Decision-maker titles only
      person_titles: JOB_TITLES,

      // Only owner-operated small businesses
      organization_num_employees_ranges: EMPLOYEE_RANGE,

      // Only contacts with a phone number on file
      contact_phone_status: ['mobile', 'direct'],

      // Pagination
      page,
      per_page: Math.min(maxResults, 25), // Apollo max is 25 per page
    };

    logger.info(`Calling Apollo people search — page ${page}, max ${maxResults}`);

    try {
      const { data } = await this.http.post('/mixed_people/search', payload);

      if (!data || !Array.isArray(data.people)) {
        logger.warn('Apollo returned an unexpected shape', data);
        return [];
      }

      logger.info(`Apollo returned ${data.people.length} raw result(s)`);
      return this._normalize(data.people);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.error || err.message;
      const errorCode = err.response?.data?.error_code;

      // Friendly message for plan-level access errors
      if (errorCode === 'API_INACCESSIBLE' || status === 403) {
        throw new Error(
          'Apollo plan does not include API people search access. ' +
          'Upgrade to the Apollo Basic plan (or higher) at https://app.apollo.io/#/settings/plans ' +
          'to enable the /v1/mixed_people/search endpoint with your API key.'
        );
      }

      throw new Error(`Apollo API error (HTTP ${status ?? 'unknown'}): ${detail}`);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Normalize a raw Apollo person record into the lead schema used by the rest
   * of the workflow. Fields that are missing map to empty strings.
   */
  _normalize(people) {
    return people
      .map((p) => {
        const phone = this._bestPhone(p);
        // Skip contacts with no phone at all
        if (!phone) return null;

        return {
          businessName: p.organization?.name || p.employment_history?.[0]?.organization_name || '',
          firstName: p.first_name || '',
          lastName: p.last_name || '',
          phone,
          city: this._extractCity(p),
          website: p.organization?.website_url || p.organization?.primary_domain || '',
        };
      })
      .filter(Boolean);
  }

  /** Pick the best available phone: mobile preferred, then direct, then any */
  _bestPhone(person) {
    if (person.mobile_phone) return person.mobile_phone;
    if (person.phone_numbers?.length) {
      const direct = person.phone_numbers.find((n) => n.type === 'direct_phone');
      if (direct) return direct.sanitized_number || direct.raw_number;
      return person.phone_numbers[0].sanitized_number || person.phone_numbers[0].raw_number;
    }
    if (person.sanitized_phone) return person.sanitized_phone;
    return null;
  }

  /** Extract the city from the person's employment location or home city */
  _extractCity(person) {
    if (person.city) return person.city;
    if (person.organization?.city) return person.organization.city;
    // Fall back to the first SW Michigan city we can detect in the location string
    const loc = (person.location || person.organization?.raw_address || '').toLowerCase();
    for (const city of SW_MICHIGAN_CITIES) {
      const name = city.split(',')[0].toLowerCase();
      if (loc.includes(name)) return city.split(',')[0];
    }
    return '';
  }
}

module.exports = { ApolloClient, SW_MICHIGAN_CITIES, JOB_TITLES, INDUSTRY_KEYWORDS };
