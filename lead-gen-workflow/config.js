require('dotenv').config();

module.exports = {
  // ── TARGET GEOGRAPHY ────────────────────────────────────────
  // Add or remove cities here to expand/narrow your search area.
  CITIES: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],
  STATE:   'Michigan',
  COUNTRY: 'United States',

  // ── INDUSTRY KEYWORDS ────────────────────────────────────────
  // Used in the Apollo keyword search to bias results toward HVAC.
  // Apollo also supports organization_industry_tag_ids if you want
  // numeric tag filtering — see the Apollo UI under Filters > Industry.
  INDUSTRY_KEYWORDS: [
    'HVAC',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
    'air conditioning',
    'furnace',
    'refrigeration',
  ],

  // ── JOB TITLES (priority order — first match wins for dedup) ─
  TARGET_TITLES: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ── COMPANY SIZE ─────────────────────────────────────────────
  // "1,25" = 1 to 25 employees (owner-operated small businesses).
  EMPLOYEE_RANGE: '1,25',

  // ── RUN LIMITS ───────────────────────────────────────────────
  // Maximum new leads written to the sheet per scheduled run.
  MAX_LEADS_PER_RUN: 25,

  // ── SCHEDULE ─────────────────────────────────────────────────
  // Cron syntax: "0 7 * * *" = every day at 7:00 AM.
  // node-cron evaluates this in the TIMEZONE below.
  CRON_SCHEDULE: '0 7 * * *',
  TIMEZONE:      'America/New_York',

  // ── SPREADSHEET ──────────────────────────────────────────────
  // Column headers written to row 1 if the sheet is empty.
  // Changing this list also changes the columns written — keep order.
  SHEET_HEADERS: [
    'Date Added',       // A
    'Business Name',    // B
    'Owner First Name', // C
    'Owner Last Name',  // D
    'Phone Number',     // E
    'City',             // F
    'Website',          // G
    'Called',           // H — left blank for manual use
    'Notes',            // I — left blank for manual use
  ],

  // Name of the tab inside your Google Spreadsheet
  SHEET_TAB_NAME: 'Leads',

  // ── CREDENTIALS ──────────────────────────────────────────────
  APOLLO_API_KEY:    process.env.APOLLO_API_KEY,
  GOOGLE_SHEET_ID:   process.env.GOOGLE_SHEET_ID,
  NOTIFY_EMAIL:      process.env.NOTIFY_EMAIL || 'jgagliardo98@gmail.com',
};
