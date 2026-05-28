/**
 * config.js — Edit this file to change target cities, job titles, or search filters.
 * All values are intentionally grouped here so you never have to hunt through source files.
 */

module.exports = {
  // ── Target Geography ─────────────────────────────────────────────────────────
  // Add or remove cities freely. Each entry is passed as a person_locations filter.
  TARGET_CITIES: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Broader state-level filter applied alongside city list
  TARGET_STATE: 'Michigan, United States',

  // ── Industry Keywords ─────────────────────────────────────────────────────────
  // Passed as q_organization_keyword_tags to Apollo people search
  INDUSTRY_KEYWORDS: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
    'Heating, Ventilation & Air Conditioning',
  ],

  // ── Company Size ──────────────────────────────────────────────────────────────
  // Apollo range format: 'min,max'
  EMPLOYEE_RANGE: '1,25',

  // ── Decision-Maker Job Titles (priority order) ────────────────────────────────
  // Apollo will try to match these titles; highest-priority contact per company wins.
  TARGET_TITLES: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ── Scheduler ─────────────────────────────────────────────────────────────────
  // node-cron expression — default: every day at 7:00 AM Eastern
  // node-cron timezone is set to America/New_York in index.js, so this is local ET.
  CRON_SCHEDULE: '0 7 * * *',

  // ── Per-run Lead Cap ──────────────────────────────────────────────────────────
  MAX_LEADS_PER_RUN: parseInt(process.env.MAX_LEADS_PER_RUN, 10) || 25,

  // ── Spreadsheet Column Order ──────────────────────────────────────────────────
  // Mirrors the header row. Change order here and nowhere else.
  SHEET_HEADERS: [
    'Date Added',
    'Business Name',
    'Owner First Name',
    'Owner Last Name',
    'Phone Number',
    'City',
    'Website',
    'Called',
    'Notes',
  ],

  // Column index (0-based) used for duplicate detection
  BUSINESS_NAME_COL_INDEX: 1,
};
