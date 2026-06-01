/**
 * config.js — Central configuration for the HVAC lead gen workflow.
 * Edit this file to change target cities, industries, job titles, or limits.
 */

module.exports = {
  // ─── Target geography ─────────────────────────────────────────────────────
  // Cities passed directly to Apollo's location filter.
  // Apollo accepts "City, State" strings for person/org location.
  targetCities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // Broader state filter as a fallback anchor
  stateFilter: 'Michigan, United States',

  // ─── Industry keyword tags sent to Apollo ─────────────────────────────────
  industryKeywords: [
    'hvac',
    'heating and air conditioning',
    'plumbing',
    'mechanical contracting',
  ],

  // ─── Employee size range (1–25 = owner-operated small businesses) ─────────
  employeeRange: '1,25',

  // ─── Job titles in priority order. Apollo scores on closest match first. ──
  targetTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ─── Max new leads appended per scheduled run ─────────────────────────────
  leadsPerRun: 25,

  // ─── Cron schedule: "0 7 * * *" = 7:00 AM every day ──────────────────────
  // Schedule uses America/New_York (Eastern Time) via the timezone option.
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',

  // ─── Google Sheet column order ────────────────────────────────────────────
  // Changing this array also changes what gets written — keep in sync with
  // the actual sheet header row.
  sheetColumns: [
    'Date Added',
    'Business Name',
    'Owner First Name',
    'Owner Last Name',
    'Phone Number',
    'City',
    'Website',
    'Called',   // left blank on insert
    'Notes',    // left blank on insert
  ],

  // ─── Which column to use for duplicate detection (0-indexed) ──────────────
  // Column B (index 1) = Business Name
  dedupeColumnIndex: 1,

  // ─── Notification email ───────────────────────────────────────────────────
  alertEmail: process.env.ALERT_EMAIL || 'jgagliardo98@gmail.com',
};
