// ─────────────────────────────────────────────────────────────────
// config.js — All user-tunable settings in one place.
// Edit this file to change cities, job titles, column layout, etc.
// ─────────────────────────────────────────────────────────────────

const config = {

  // ── Target cities ─────────────────────────────────────────────
  // Apollo matches against the organization's HQ city.
  // Add or remove entries freely — no other code changes needed.
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // ── Job titles (priority order) ───────────────────────────────
  // Apollo uses these for an exact + fuzzy match.
  // Listed in the priority you want — results are returned in
  // the order Apollo ranks them, not this array order.
  jobTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ── Industry keyword tags ─────────────────────────────────────
  // Apollo matches these against company tags and descriptions.
  industryKeywords: [
    'hvac',
    'heating',
    'air conditioning',
    'heating and cooling',
    'plumbing',
    'mechanical contracting',
  ],

  // ── Company size: 1–25 employees ─────────────────────────────
  // Format: 'min,max' strings as required by Apollo's API.
  employeeRanges: ['1,10', '11,25'],

  // ── Per-run lead cap ──────────────────────────────────────────
  // New leads added to the sheet per scheduled run.
  maxLeadsPerRun: 25,

  // ── Cron schedule ─────────────────────────────────────────────
  // '0 7 * * *' = 7:00 AM every day.
  // node-cron supports the IANA timezone name via the `timezone` option.
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',

  // ── Google Sheet layout ───────────────────────────────────────
  // Name of the tab inside the spreadsheet.
  sheetTab: 'Sheet1',

  // Column letters, in order. If you insert/reorder columns,
  // update the letters here — everything else adapts automatically.
  columns: {
    dateAdded:    'A',
    businessName: 'B',
    firstName:    'C',
    lastName:     'D',
    phone:        'E',
    city:         'F',
    website:      'G',
    called:       'H',  // left blank — manual tracking
    notes:        'I',  // left blank — manual tracking
  },
};

module.exports = config;
