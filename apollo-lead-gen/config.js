/**
 * config.js — All tunable settings for the lead generation workflow.
 * Edit this file to change target cities, filters, or column layout.
 */

module.exports = {
  // ── Target geography ────────────────────────────────────────────────────────
  // These cities are passed as location filters in Apollo and used for
  // client-side filtering. Add or remove cities freely.
  TARGET_CITIES: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // Broader state/region sent to Apollo so results aren't over-restricted.
  // Apollo will return all of Michigan; TARGET_CITIES narrows it client-side.
  APOLLO_LOCATION: 'Michigan, United States',

  // ── Industry keywords ────────────────────────────────────────────────────────
  // Sent as q_keywords to Apollo. Broad enough to catch HVAC, plumbing, etc.
  INDUSTRY_KEYWORDS:
    'HVAC OR "heating and air conditioning" OR plumbing OR "mechanical contracting" OR "air conditioning" OR furnace',

  // ── Company size ─────────────────────────────────────────────────────────────
  // Apollo format: "min,max" — 1-25 employees targets owner-operated shops.
  EMPLOYEE_RANGE: ['1,25'],

  // ── Job title priority ───────────────────────────────────────────────────────
  // Apollo searches these in the order listed. The first match for a business
  // is used; lower-priority titles are only pulled if no higher one is found.
  JOB_TITLES: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ── Per-run cap ──────────────────────────────────────────────────────────────
  MAX_LEADS_PER_RUN: 25,

  // ── Schedule ─────────────────────────────────────────────────────────────────
  // node-cron expression (TZ is set to America/New_York in index.js)
  // Default: 7:00 AM Eastern every day.
  CRON_SCHEDULE: '0 7 * * *',

  // ── Google Sheet columns (order matters) ─────────────────────────────────────
  // To add/remove a column, update this list AND the buildRow() function in
  // sheets.js so they stay in sync.
  SHEET_COLUMNS: [
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

  // Row number (1-based) that contains the header — used to skip it when
  // reading existing business names for duplicate detection.
  HEADER_ROW: 1,

  // Column index (0-based) of "Business Name" in SHEET_COLUMNS.
  BUSINESS_NAME_COL: 1,
};
