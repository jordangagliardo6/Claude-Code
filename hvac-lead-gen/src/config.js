/**
 * config.js — All tunable settings in one place.
 * Edit this file to change cities, job titles, industries, or column layout.
 */

module.exports = {
  // ─────────────────────────────────────────────────────────────
  // TARGET CITIES — Southwest Michigan. Add or remove freely.
  // Apollo expects "City, State, Country" format.
  // ─────────────────────────────────────────────────────────────
  targetCities: [
    'St. Joseph, Michigan, United States',
    'Benton Harbor, Michigan, United States',
    'Kalamazoo, Michigan, United States',
    'Holland, Michigan, United States',
    'Grand Haven, Michigan, United States',
    'Muskegon, Michigan, United States',
    'South Haven, Michigan, United States',
  ],

  // ─────────────────────────────────────────────────────────────
  // JOB TITLES — listed in priority order (Owner first, GM last).
  // Apollo searches for exact and fuzzy matches.
  // ─────────────────────────────────────────────────────────────
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ─────────────────────────────────────────────────────────────
  // INDUSTRY KEYWORDS — Apollo matches these against company tags.
  // ─────────────────────────────────────────────────────────────
  industryKeywords: [
    'hvac',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
  ],

  // ─────────────────────────────────────────────────────────────
  // COMPANY SIZE — "min,max" format for Apollo's employee filter.
  // ─────────────────────────────────────────────────────────────
  employeeRange: ['1,25'],

  // ─────────────────────────────────────────────────────────────
  // RUN SETTINGS
  // ─────────────────────────────────────────────────────────────
  maxLeadsPerRun: 25,     // cap per scheduled run — stays manageable
  apolloFetchBuffer: 2,   // over-fetch multiplier to compensate for dedup/no-phone filtering

  // ─────────────────────────────────────────────────────────────
  // SCHEDULE — 7:00 AM Eastern. Timezone set in index.js.
  // ─────────────────────────────────────────────────────────────
  cronSchedule: '0 7 * * *',

  // ─────────────────────────────────────────────────────────────
  // SPREADSHEET COLUMNS (must match your Google Sheet header row).
  // Reorder this array if you rearrange your columns.
  // ─────────────────────────────────────────────────────────────
  columnHeaders: [
    'Date Added',        // A
    'Business Name',     // B  ← also used for duplicate detection
    'Owner First Name',  // C
    'Owner Last Name',   // D
    'Phone Number',      // E
    'City',              // F
    'Website',           // G
    'Called',            // H  left blank
    'Notes',             // I  left blank
  ],

  // Sheet tab name — change if your tab is not named "Sheet1"
  sheetTabName: 'Sheet1',
};
