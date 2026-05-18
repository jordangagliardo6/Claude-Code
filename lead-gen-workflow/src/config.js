'use strict';

// ─── Geography ────────────────────────────────────────────────────────────────
// Add or remove cities here. Apollo expects "City, State, Country" format.
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

const TARGET_LOCATIONS = TARGET_CITIES.map(
  (city) => `${city}, Michigan, United States`
);

// ─── Industry keywords ────────────────────────────────────────────────────────
// Apollo's free-text q_keywords searches across company name, description, and tags.
// Adjust if you want to broaden or narrow the industry match.
const INDUSTRY_KEYWORDS =
  'HVAC heating cooling air conditioning plumbing mechanical contractor';

// Apollo numeric industry tag IDs (optional, adds a second filter layer).
// To find IDs: run `node setup.js --list-industries` or check Apollo's web filter panel.
// Leave empty [] to rely on keyword matching only.
const INDUSTRY_TAG_IDS = [];

// ─── Decision-maker titles ────────────────────────────────────────────────────
// Order matters — when a company has multiple contacts, the one with the
// lowest index title is preferred.
const JOB_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ─── Company size ─────────────────────────────────────────────────────────────
// Apollo format: "min,max" — keeps this to owner-operated small shops.
const EMPLOYEE_RANGES = ['1,25'];

// ─── Run limits ───────────────────────────────────────────────────────────────
const MAX_LEADS_PER_RUN = 25;
// How many results to request from Apollo per API call (fetch more than needed
// so we have room to discard duplicates and no-phone contacts).
const APOLLO_PER_PAGE = 50;

// ─── Schedule ─────────────────────────────────────────────────────────────────
// Standard cron syntax. node-cron handles DST automatically via the timezone option.
const CRON_SCHEDULE = '0 7 * * *'; // every day at 07:00
const CRON_TIMEZONE = 'America/New_York';

// ─── Sheet layout ─────────────────────────────────────────────────────────────
// Column index (0-based) → header text. Change the order here and the rest
// of the code adapts automatically.
const COLUMN_HEADERS = [
  'Date Added',       // A
  'Business Name',    // B  ← duplicate check uses this column
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  (left blank)
  'Notes',            // I  (left blank)
];

const COLUMNS = {
  DATE_ADDED:    0,
  BUSINESS_NAME: 1,
  FIRST_NAME:    2,
  LAST_NAME:     3,
  PHONE:         4,
  CITY:          5,
  WEBSITE:       6,
  CALLED:        7,
  NOTES:         8,
};

module.exports = {
  TARGET_CITIES,
  TARGET_LOCATIONS,
  INDUSTRY_KEYWORDS,
  INDUSTRY_TAG_IDS,
  JOB_TITLES,
  EMPLOYEE_RANGES,
  MAX_LEADS_PER_RUN,
  APOLLO_PER_PAGE,
  CRON_SCHEDULE,
  CRON_TIMEZONE,
  COLUMN_HEADERS,
  COLUMNS,
  SHEET_NAME: process.env.GOOGLE_SHEET_NAME || 'Sheet1',
};
