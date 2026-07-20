'use strict';

/**
 * config.js — Edit this file to change cities, industries, titles, or sheet layout.
 * The rest of the code reads from here; you should rarely need to touch index.js.
 */
module.exports = {

  // ── Target Cities ────────────────────────────────────────────────────────
  // The workflow fetches all Michigan HVAC results and then filters to this list.
  // City names are matched case-insensitively against Apollo's city field.
  targetCities: [
    'St. Joseph',
    'Saint Joseph',   // Apollo sometimes uses the full form
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // Apollo location string used in the API query (state-level keeps the net wide)
  apolloLocations: ['Michigan, United States'],

  // ── Industry Filters ─────────────────────────────────────────────────────
  // Apollo matches these against company keyword tags.
  // Add/remove terms to widen or narrow the industry scope.
  industryKeywords: [
    'hvac',
    'heating and air conditioning',
    'heating and cooling',
    'air conditioning',
    'plumbing',
    'mechanical contractor',
    'mechanical contracting',
  ],

  // SIC code 1711 = Plumbing, Heating, Air-Conditioning (primary filter)
  // NAICS 238220 = Plumbing, Heating, Air-Conditioning Contractors
  apolloSicCodes: ['1711'],
  apolloNaicsCodes: ['238220'],

  // ── Target Job Titles ────────────────────────────────────────────────────
  // Listed in descending priority. Apollo returns people whose titles
  // match or are similar to these strings.
  targetTitles: [
    'owner',
    'president',
    'founder',
    'co-founder',
    'co founder',
    'general manager',
  ],

  // Company size: 1–25 employees (owner-operated small businesses)
  employeeRanges: ['1,10', '11,25'],

  // ── Run Limits ───────────────────────────────────────────────────────────
  // Maximum new leads added per scheduled run
  maxLeadsPerRun: 25,

  // Apollo pages to scan per run (100 results/page; 5 pages = 500 candidates)
  maxPagesToScan: 5,

  // ── Google Sheets Layout ─────────────────────────────────────────────────
  // Column order must match your spreadsheet exactly (left to right).
  // To rearrange columns, change the order here AND in your sheet header row.
  sheetColumns: [
    'Date Added',        // A
    'Business Name',     // B  ← also used for duplicate detection
    'Owner First Name',  // C
    'Owner Last Name',   // D
    'Phone Number',      // E
    'City',              // F
    'Website',           // G
    'Called',            // H  (left blank for you to fill in)
    'Notes',             // I  (left blank for you to fill in)
  ],

  // 0-based column index in sheetColumns that identifies a duplicate
  dedupeColumnIndex: 1, // Business Name

  // Name of the sheet tab inside your spreadsheet
  sheetTabName: 'Sheet1',

  // ── Scheduler ────────────────────────────────────────────────────────────
  // Runs at 7:00 AM Eastern Time every morning.
  // Cron format: minute hour day-of-month month day-of-week
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',

};
