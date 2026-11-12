/**
 * config.js — central place to edit cities, industries, job titles, and limits.
 * Modify CITIES or TARGET_TITLES here without touching the core logic.
 */

module.exports = {
  // ── Target geography ────────────────────────────────────────────────────────
  // Apollo location filter value (state-level); SW Michigan bias is enforced
  // by per-city searches in apollo.js.
  STATE: 'Michigan',
  COUNTRY: 'United States',

  // Cities to rotate through each run. Add or remove entries here freely.
  CITIES: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
    'Stevensville',
    'Portage',
    'Paw Paw',
    'Mattawan',
    'Coloma',
    'Watervliet',
    'Three Rivers',
    'Dowagiac',
    'Hartford',
    'Zeeland',
    'Grand Haven',
  ],

  // ── Industry / keyword filters ───────────────────────────────────────────
  INDUSTRY_KEYWORDS: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // ── Employee count ───────────────────────────────────────────────────────
  MIN_EMPLOYEES: 1,
  MAX_EMPLOYEES: 25,

  // ── Decision-maker titles (checked in priority order) ───────────────────
  // Apollo returns multiple people per org; we pick the highest-priority title.
  TARGET_TITLES: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],

  // ── Run limits ───────────────────────────────────────────────────────────
  MAX_LEADS_PER_RUN: 25,

  // ── Scheduler (node-cron syntax, America/New_York = Eastern) ────────────
  // "0 7 * * *" = every day at 7:00 AM
  CRON_SCHEDULE: '0 7 * * *',
  CRON_TIMEZONE: 'America/New_York',

  // ── Google Sheets ────────────────────────────────────────────────────────
  // Sheet name inside the spreadsheet (the tab at the bottom)
  SHEET_TAB: 'Sheet1',
  // Column order must match the spreadsheet header row
  COLUMNS: [
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
};
