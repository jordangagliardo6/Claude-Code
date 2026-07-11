/**
 * config.js — All customizable settings for the HVAC lead gen workflow.
 * Edit this file to change cities, industries, titles, or run limits.
 */

module.exports = {

  // ─── Target Locations ───────────────────────────────────────────────────────
  // Apollo searches one city at a time. Add or remove cities freely.
  targetCities: [
    'St. Joseph, Michigan, United States',
    'Benton Harbor, Michigan, United States',
    'Kalamazoo, Michigan, United States',
    'Holland, Michigan, United States',
    'Grand Haven, Michigan, United States',
    'Muskegon, Michigan, United States',
    'South Haven, Michigan, United States',
  ],

  // ─── Industry Keywords ──────────────────────────────────────────────────────
  // Apollo matches these against the company's industry tags.
  // All lowercase — Apollo is case-sensitive on keyword tags.
  industries: [
    'hvac',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
    'heating',
    'air conditioning',
  ],

  // ─── Target Job Titles ──────────────────────────────────────────────────────
  // Listed in priority order; Apollo returns whoever matches any of these.
  // Title priority scoring is applied after results come back (see apollo.js).
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Title priority map for sorting (lower number = higher priority)
  titlePriority: {
    'owner':           1,
    'president':       2,
    'founder':         3,
    'co-founder':      4,
    'cofounder':       4,
    'general manager': 5,
  },

  // ─── Company Size ───────────────────────────────────────────────────────────
  // "1,25" means 1 to 25 employees — owner-operated small businesses.
  employeeRange: '1,25',

  // ─── Run Limits ─────────────────────────────────────────────────────────────
  // Maximum NEW leads to add per scheduled run (keeps the list manageable).
  maxLeadsPerRun: 25,

  // Max results to request per Apollo API call (per city).
  apolloPageSize: 50,

  // ─── Schedule ───────────────────────────────────────────────────────────────
  // Runs at 7:00 AM Eastern Time every day.
  // node-cron format: second(opt) minute hour day-of-month month day-of-week
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',

  // ─── Google Sheets ──────────────────────────────────────────────────────────
  sheets: {
    // Column headers in exact order (do not reorder without updating index.js too)
    columns: [
      'Date Added',       // A
      'Business Name',    // B  ← dedup key
      'Owner First Name', // C
      'Owner Last Name',  // D
      'Phone Number',     // E
      'City',             // F
      'Website',          // G
      'Called',           // H  (left blank for manual use)
      'Notes',            // I  (left blank for manual use)
    ],

    // 1-based column letter for Business Name (used in range queries)
    businessNameRange: 'B:B',
    // Full data range (9 columns A–I)
    dataRange: 'A:I',
    // Row where data starts (row 1 = headers, row 2 = first data row)
    firstDataRow: 2,
  },
};
