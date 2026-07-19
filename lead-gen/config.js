'use strict';

// ─── Search Targets ──────────────────────────────────────────────────────────
// Modify these arrays to change cities, industries, or titles without touching
// any other file. Each city-state string maps directly to Apollo's location filter.

const TARGET_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Also search at state level to catch nearby unincorporated areas
const FALLBACK_LOCATION = 'Michigan, United States';

// Industries to target (Apollo keyword tags)
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
];

// Job titles in priority order. Apollo returns results ranked by relevance,
// but we sort our final list in this title priority order before writing.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Apollo employee range string (inclusive on both ends)
const EMPLOYEE_RANGE = '1,25';

// ─── Run Settings ─────────────────────────────────────────────────────────────
const MAX_LEADS_PER_RUN = 25;

// Cron expression: 7:00 AM every day
const CRON_SCHEDULE = '0 7 * * *';
const CRON_TIMEZONE = 'America/New_York';

// ─── Google Sheet Column Layout ───────────────────────────────────────────────
// Edit the array to add/remove/reorder columns. The code reads this array to
// know which position each field maps to — no other file needs to change.
const SHEET_COLUMNS = [
  'Date Added',       // A  — filled automatically
  'Business Name',    // B  — used for duplicate check
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  — left blank for manual use
  'Notes',            // I  — left blank for manual use
];

// ─── Phone Type Priority ─────────────────────────────────────────────────────
// When Apollo returns multiple phone numbers, pick the first matching type.
const PHONE_TYPE_PRIORITY = ['direct_phone', 'mobile_phone', 'other'];

module.exports = {
  TARGET_CITIES,
  FALLBACK_LOCATION,
  TARGET_INDUSTRIES,
  TARGET_TITLES,
  EMPLOYEE_RANGE,
  MAX_LEADS_PER_RUN,
  CRON_SCHEDULE,
  CRON_TIMEZONE,
  SHEET_COLUMNS,
  PHONE_TYPE_PRIORITY,
};
