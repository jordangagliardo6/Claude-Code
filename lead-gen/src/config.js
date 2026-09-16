/**
 * config.js — All tunable settings for the HVAC lead gen workflow.
 * Edit this file to change cities, job titles, column order, or limits.
 */

// ─── Schedule ────────────────────────────────────────────────────────────────
// Runs every day at 7:00 AM Eastern Time (node-cron uses server local time
// or you can set TZ="America/New_York" in your environment).
const CRON_SCHEDULE = '0 7 * * *';

// Maximum new leads added per run (keeps the list manageable).
const MAX_LEADS_PER_RUN = 25;

// ─── Google Sheets ───────────────────────────────────────────────────────────
// The spreadsheet ID from the Google Drive URL:
// https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '15DJVZJiMnbt6tdF6e2RMcGY6_M1JrjxomiIJJPJykhU';

// The exact tab name inside the spreadsheet to append rows to.
const SHEET_TAB_NAME = process.env.SHEET_TAB_NAME || 'Sheet1';

// Column order — change to reorder or rename columns. Keep keys matching FIELD_MAP below.
const COLUMNS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',   // left blank intentionally
  'Notes',    // left blank intentionally
];

// ─── Target Cities ───────────────────────────────────────────────────────────
// Add or remove cities here. Apollo location search is city + state.
const TARGET_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Broader state-level filter (Apollo uses this as the location anchor).
const TARGET_STATE = 'Michigan, United States';

// ─── Apollo Filters ──────────────────────────────────────────────────────────
// Job titles to target, in priority order (Owner first).
const TARGET_JOB_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Only show exact matches for these titles (set to true to widen with similar titles).
const INCLUDE_SIMILAR_TITLES = false;

// Company headcount: 1–25 employees (owner-operated small businesses).
const EMPLOYEE_RANGES = ['1,10', '11,25'];

// NAICS code 23822 = Plumbing, Heating, and Air-Conditioning Contractors.
// 23821 = Electrical; add more as needed.
const NAICS_CODES = ['23822'];

// Keyword terms sent to Apollo's q_keywords field for additional signal.
const APOLLO_KEYWORDS = 'HVAC heating air conditioning plumbing mechanical contractor';

// ─── Error Notification ───────────────────────────────────────────────────────
// Email address to notify on failure. Set via env var or edit here.
const ERROR_EMAIL_TO   = process.env.ERROR_EMAIL_TO   || 'jgagliardo98@gmail.com';
const ERROR_EMAIL_FROM = process.env.ERROR_EMAIL_FROM || process.env.GMAIL_USER || '';

module.exports = {
  CRON_SCHEDULE,
  MAX_LEADS_PER_RUN,
  SPREADSHEET_ID,
  SHEET_TAB_NAME,
  COLUMNS,
  TARGET_CITIES,
  TARGET_STATE,
  TARGET_JOB_TITLES,
  INCLUDE_SIMILAR_TITLES,
  EMPLOYEE_RANGES,
  NAICS_CODES,
  APOLLO_KEYWORDS,
  ERROR_EMAIL_TO,
  ERROR_EMAIL_FROM,
};
