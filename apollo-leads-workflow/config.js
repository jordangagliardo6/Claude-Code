/**
 * Configuration for the HVAC lead generation workflow.
 * Edit this file to change cities, job titles, industries, or sheet settings.
 */

module.exports = {
  // ─── Apollo search filters ─────────────────────────────────────────────────

  // Cities to target (matched against person's location, not company HQ)
  TARGET_CITIES: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
    'Stevensville, Michigan',
    'Watervliet, Michigan',
    'Coloma, Michigan',
    'South Bend, Indiana',   // border area — remove if too broad
  ],

  // Job titles to target, in priority order (Owner first, then fallbacks)
  TARGET_TITLES: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Industry keyword tags sent to Apollo
  INDUSTRY_TAGS: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
    'Heating',
    'Cooling',
    'Air Conditioning',
  ],

  // Company size: 1–25 employees only (owner-operated)
  EMPLOYEE_RANGES: ['1,25'],

  // ─── Run settings ──────────────────────────────────────────────────────────

  // Max new leads to add per scheduled run
  MAX_LEADS_PER_RUN: 25,

  // How many results to fetch from Apollo per page (up to 100)
  APOLLO_PAGE_SIZE: 50,

  // ─── Google Sheets settings ────────────────────────────────────────────────

  // The ID from the spreadsheet URL:
  //   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
  // Defaults to SW Michigan HVAC Leads — Sept 8 2026 sheet.
  // Override with SPREADSHEET_ID env var.
  SPREADSHEET_ID: process.env.SPREADSHEET_ID || '15DJVZJiMnbt6tdF6e2RMcGY6_M1JrjxomiIJJPJykhU',

  // Name of the tab inside the spreadsheet that holds leads
  SHEET_TAB: process.env.SHEET_TAB || 'Sheet1',

  // Column order must match the sheet headers exactly
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

  // Column index (0-based) used for duplicate checking
  DEDUP_COLUMN: 'Business Name',
};
