'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Edit this file freely. All search parameters live here so you never need
// to touch the core logic to change cities, industries, or column layout.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Southwest Michigan cities to search in Apollo.
 * Each entry is searched individually so you get coverage across the region.
 * Add or remove cities here — format: 'City, Michigan, United States'
 */
const TARGET_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

/**
 * Industry keywords matched against Apollo company tags.
 * Apollo uses these for fuzzy/semantic matching on the organization side.
 */
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'heating',
  'air conditioning',
  'plumbing',
  'mechanical contracting',
];

/**
 * Job titles to target, in priority order.
 * Apollo applies semantic matching so 'owner' also catches 'co-owner', etc.
 */
const TARGET_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'general manager',
];

/**
 * Company size filter — 1 to 25 employees (owner-operated small businesses).
 * Format: 'min,max' inclusive. Apollo uses these as named ranges.
 */
const EMPLOYEE_RANGES = ['1,10', '11,25'];

/**
 * Max leads to append per scheduled run. Keeps the list manageable.
 * The script fetches 3× this number from Apollo then filters down.
 */
const MAX_LEADS_PER_RUN = 25;

// ─── Google Sheets layout ─────────────────────────────────────────────────────

/** Tab name inside the spreadsheet to write leads into. */
const SHEET_TAB = 'Leads';

/**
 * Column headers in order A → I.
 * If you add/remove columns here, also update the appendRows() call in sheets.js
 * to include/exclude the matching field.
 */
const SHEET_COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B  ← deduplication key
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank — for manual tracking)
  'Notes',            // I  (left blank — for manual notes)
];

// ─── Scheduler ────────────────────────────────────────────────────────────────

/** Cron expression — every day at 7:00 AM. Timezone applied separately. */
const CRON_SCHEDULE = '0 7 * * *';

/** IANA timezone. Change to 'America/Chicago' (CT), etc. if needed. */
const CRON_TIMEZONE = 'America/New_York';

module.exports = {
  TARGET_CITIES,
  INDUSTRY_KEYWORDS,
  TARGET_TITLES,
  EMPLOYEE_RANGES,
  MAX_LEADS_PER_RUN,
  SHEET_TAB,
  SHEET_COLUMNS,
  CRON_SCHEDULE,
  CRON_TIMEZONE,
};
