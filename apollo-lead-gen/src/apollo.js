'use strict';

const axios = require('axios');
const {
  APOLLO_BASE_URL,
  JOB_TITLES,
  EMPLOYEE_RANGES,
  INDUSTRY_KEYWORDS,
  APOLLO_REQUEST_DELAY_MS,
} = require('./config');

// Simple promise-based delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class ApolloClient {
  constructor(apiKey) {
    if (!apiKey) throw new Error('APOLLO_API_KEY is required');
    this.client = axios.create({
      baseURL: APOLLO_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      timeout: 30_000,
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Searches Apollo for HVAC owner/decision-maker contacts in a single city.
   * Returns an array of cleaned lead objects ready to write to the sheet.
   *
   * @param {string} location   e.g. "Kalamazoo, Michigan, United States"
   * @param {number} maxResults Max contacts to return for this city
   */
  async searchLeadsForCity(location, maxResults = 25) {
    const results = [];
    let page = 1;
    const perPage = Math.min(maxResults, 25); // Apollo caps per_page at 100; we keep it small

    console.log(`  [Apollo] Searching: ${location}`);

    while (results.length < maxResults) {
      let response;
      try {
        response = await this._searchPeople({
          location,
          page,
          perPage,
        });
      } catch (err) {
        if (err.response?.status === 429) {
          // Rate limited — back off and retry once
          console.warn('  [Apollo] Rate limited. Waiting 10s before retry...');
          await sleep(10_000);
          response = await this._searchPeople({ location, page, perPage });
        } else {
          throw err;
        }
      }

      const people = response.data?.people ?? [];
      if (people.length === 0) break; // No more results for this location

      for (const person of people) {
        if (results.length >= maxResults) break;

        const lead = this._extractLead(person);
        if (lead) results.push(lead);
      }

      // Check if we've reached the last page
      const pagination = response.data?.pagination ?? {};
      if (page >= (pagination.total_pages ?? 1)) break;

      page++;
      await sleep(APOLLO_REQUEST_DELAY_MS);
    }

    console.log(`  [Apollo] Found ${results.length} leads with phone numbers in ${location.split(',')[0]}`);
    return results;
  }

  /**
   * Quick connectivity test — returns true if the API key is valid.
   */
  async testConnection() {
    try {
      const res = await this._searchPeople({
        location: 'Kalamazoo, Michigan, United States',
        page: 1,
        perPage: 1,
      });
      return {
        ok: true,
        totalResults: res.data?.pagination?.total_entries ?? 0,
      };
    } catch (err) {
      return {
        ok: false,
        error: this._friendlyError(err),
      };
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  async _searchPeople({ location, page, perPage }) {
    return this.client.post('/mixed_people/search', {
      page,
      per_page: perPage,
      person_titles: JOB_TITLES,
      organization_num_employees_ranges: EMPLOYEE_RANGES,
      person_locations: [location],
      // Apollo keyword tags — filters companies whose industry tags include any of these
      q_organization_keyword_tags: INDUSTRY_KEYWORDS,
      // Prefer contacts with phone numbers surfaced
      reveal_personal_emails: false,
      sort_by_field: 'recommendations_score',
      sort_ascending: false,
    });
  }

  /**
   * Maps a raw Apollo person object to a flat lead object.
   * Returns null if the contact has no usable phone number.
   */
  _extractLead(person) {
    const phone = this._bestPhone(person);
    if (!phone) return null; // Skip contacts with no phone

    const account = person.account ?? person.organization ?? {};

    // City: prefer person-level city (more accurate), fall back to account city
    const city =
      person.city ||
      account.city ||
      '';

    return {
      businessName: account.name ?? '',
      firstName:    person.first_name ?? '',
      lastName:     person.last_name ?? '',
      phone,
      city,
      website:      this._cleanUrl(account.website_url ?? account.primary_domain ?? ''),
    };
  }

  /**
   * Picks the best available phone number for a contact.
   * Priority: personal mobile → personal direct → account/business phone
   */
  _bestPhone(person) {
    const nums = person.phone_numbers ?? [];

    // Prefer mobile, then any personal number
    const mobile = nums.find((n) => n.type === 'mobile');
    if (mobile?.sanitized_number) return this._formatPhone(mobile.sanitized_number);

    const direct = nums.find((n) => n.sanitized_number);
    if (direct?.sanitized_number) return this._formatPhone(direct.sanitized_number);

    // Fall back to account/business phone
    const acct = person.account ?? person.organization ?? {};
    const bizPhone =
      acct.primary_phone?.number ??
      acct.primary_phone?.sanitized_number ??
      acct.phone ??
      acct.sanitized_phone ??
      '';
    if (bizPhone) return this._formatPhone(bizPhone);

    return null;
  }

  // Converts "+12695551234" → "(269) 555-1234" for readability
  _formatPhone(raw) {
    const digits = raw.replace(/\D/g, '');
    // Strip leading country code "1" for US numbers
    const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    if (local.length !== 10) return raw; // Non-standard — return as-is
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }

  _cleanUrl(url) {
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) return `https://${url}`;
    return url;
  }

  _friendlyError(err) {
    if (err.response?.status === 401) return 'Invalid API key (401 Unauthorized)';
    if (err.response?.status === 403) return 'API key lacks permission (403 Forbidden)';
    if (err.response?.status === 429) return 'Rate limit exceeded (429) — try again later';
    if (err.code === 'ECONNREFUSED') return 'Could not connect to Apollo API';
    return err.message ?? String(err);
  }
}

module.exports = ApolloClient;
