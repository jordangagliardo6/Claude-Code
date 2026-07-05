/**
 * config.js — central configuration for the HVAC lead gen workflow.
 * Edit this file to change cities, industries, job titles, or the run schedule.
 */

module.exports = {
  // ── Target geography ───────────────────────────────────────────────────
  // These are used to post-filter Apollo results. Apollo's own location
  // filter is set to Michigan broadly; we narrow down here in code.
  targetCities: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  // Strings passed to Apollo's person_locations filter.
  // Includes both city-level and state-level entries so we don't miss leads
  // whose profiles only list "Michigan" without a specific city.
  apolloLocations: [
    'St. Joseph, Michigan, United States',
    'Benton Harbor, Michigan, United States',
    'Kalamazoo, Michigan, United States',
    'Holland, Michigan, United States',
    'Grand Haven, Michigan, United States',
    'Muskegon, Michigan, United States',
    'South Haven, Michigan, United States',
    'Michigan, United States',
  ],

  // ── Industry keywords ──────────────────────────────────────────────────
  // Used for Apollo's keyword search against company industry tags.
  industries: [
    'hvac',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
    'heating',
    'air conditioning',
  ],

  // ── Job titles (in priority order) ────────────────────────────────────
  // Apollo will return people whose titles match any entry here.
  // We re-sort results client-side to honour this priority ranking.
  jobTitlePriority: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ── Company size ───────────────────────────────────────────────────────
  // Apollo format: "min,max" as a string inside an array.
  // "1,25" targets owner-operated small businesses.
  employeeRanges: ['1,25'],

  // ── Run limits ─────────────────────────────────────────────────────────
  // Maximum new leads appended per scheduled run.
  maxLeadsPerRun: 25,

  // ── Scheduler ──────────────────────────────────────────────────────────
  // Runs at 7:00 AM Eastern every day.
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',

  // ── Google Sheet ───────────────────────────────────────────────────────
  // Name of the sheet tab inside your spreadsheet.
  sheetTab: 'Leads',

  // Column headers in the exact order they will be written.
  // Change these here if you ever need different column names —
  // the code references them by array position, not by name.
  sheetHeaders: [
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
