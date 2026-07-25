'use strict';

// ─── Search targets ──────────────────────────────────────────────────────────
// Add or remove cities here. Apollo searches each city separately and
// combines results, stopping once MAX_LEADS_PER_RUN is reached.
const TARGET_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// ─── Apollo filters ───────────────────────────────────────────────────────────
// Job titles searched in priority order (Apollo returns best match first).
// Apollo does OR-matching across this list so all titles are active simultaneously.
const JOB_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Employee count ranges — covers 1-25 total employees (owner-operated shops).
// Format: "min,max"  Apollo treats these as inclusive bounds.
const EMPLOYEE_RANGES = ['1,10', '11,25'];

// Industry keyword tags Apollo uses for company classification.
// Apollo's OR logic: a company matching ANY of these tags will be included.
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'Heating and Air Conditioning',
  'Heating, Ventilation & Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Mechanical Engineering',
  'Construction',
];

// ─── Sheet columns ────────────────────────────────────────────────────────────
// Must match the header row in your Google Sheet (case-sensitive, in order).
// To rename a column, change it here AND in your actual sheet header row.
const SHEET_COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  — left blank, you fill this in
  'Notes',            // I  — left blank, you fill this in
];

// ─── Run settings ─────────────────────────────────────────────────────────────
const MAX_LEADS_PER_RUN = 25;  // Max new leads added per scheduled run

// Cron schedule: every day at 7:00 AM Eastern Time
const CRON_SCHEDULE  = '0 7 * * *';
const CRON_TIMEZONE  = 'America/New_York';

// Apollo API base URL
const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

// Milliseconds to wait between Apollo requests (avoids rate limiting)
const APOLLO_REQUEST_DELAY_MS = 1200;

module.exports = {
  TARGET_CITIES,
  JOB_TITLES,
  EMPLOYEE_RANGES,
  INDUSTRY_KEYWORDS,
  SHEET_COLUMNS,
  MAX_LEADS_PER_RUN,
  CRON_SCHEDULE,
  CRON_TIMEZONE,
  APOLLO_BASE_URL,
  APOLLO_REQUEST_DELAY_MS,
};
