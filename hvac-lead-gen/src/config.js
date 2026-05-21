/**
 * Central configuration — edit cities, titles, or schedule here without
 * touching any other file.
 */
module.exports = {
  // ── Target geography ───────────────────────────────────────────────────────
  // Add or remove cities freely; format: "City, Michigan"
  cities: [
    'St. Joseph, Michigan',
    'Benton Harbor, Michigan',
    'Kalamazoo, Michigan',
    'Holland, Michigan',
    'Grand Haven, Michigan',
    'Muskegon, Michigan',
    'South Haven, Michigan',
  ],

  // ── Job titles (Apollo searches these in the order listed) ─────────────────
  jobTitles: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // ── Industry keywords sent to Apollo ──────────────────────────────────────
  industries: [
    'HVAC',
    'Heating and Air Conditioning',
    'Plumbing',
    'Mechanical Contracting',
  ],

  // ── Company size filter ────────────────────────────────────────────────────
  // Format Apollo expects: "min,max"
  employeeRange: '1,25',

  // ── How many leads to pull per scheduled run ───────────────────────────────
  maxLeadsPerRun: 25,

  // ── Cron schedule: 7:00 AM Eastern every day ──────────────────────────────
  cronSchedule: '0 7 * * *',
  cronTimezone: 'America/New_York',

  // ── Google Sheet column order ──────────────────────────────────────────────
  // Change column names here if needed; append new ones at the end.
  sheetColumns: [
    'Date Added',        // A
    'Business Name',     // B  ← used for dedup
    'Owner First Name',  // C
    'Owner Last Name',   // D
    'Phone Number',      // E
    'City',              // F
    'Website',           // G
    'Called',            // H  (left blank for you to fill)
    'Notes',             // I  (left blank for you to fill)
  ],
};
