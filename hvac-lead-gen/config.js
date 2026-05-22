'use strict';

// ─── SEARCH CONFIGURATION ────────────────────────────────────────────────────
// Modify these arrays freely — no other file needs to change.

const TARGET_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Broader SW Michigan area used for post-fetch city matching
const SW_MICHIGAN_CITIES = [
  'st joseph', 'saint joseph', 'benton harbor', 'kalamazoo',
  'holland', 'grand haven', 'muskegon', 'south haven',
  'berrien springs', 'niles', 'stevensville', 'bridgman',
  'coloma', 'watervliet', 'paw paw', 'mattawan', 'portage',
  'comstock', 'oshtemo', 'allegan', 'zeeland', 'hudsonville',
  'jenison', 'spring lake', 'ferrysburg', 'norton shores',
  'muskegon heights', 'north muskegon', 'whitehall', 'montague',
  'saugatuck', 'douglas', 'fennville', 'lawton', 'plainwell',
];

// Job titles — order here is the display priority (Owner first)
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Apollo keyword tags for industry filtering
const TARGET_INDUSTRIES = [
  'hvac',
  'heating and air conditioning',
  'heating, ventilating & air conditioning',
  'plumbing',
  'mechanical contracting',
  'air conditioning',
  'heating',
];

// ─── SHEET COLUMN ORDER ───────────────────────────────────────────────────────
// Add, remove, or reorder columns here. The header names must match the sheet.
const SHEET_COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H  — left blank by workflow
  'Notes',            // I  — left blank by workflow
];

// ─── RUN SETTINGS ─────────────────────────────────────────────────────────────
const MAX_LEADS_PER_RUN = 25;

// node-cron schedule — timezone is set separately in index.js
// This cron string means "7:00 AM every day"
const CRON_SCHEDULE = '0 7 * * *';
const CRON_TIMEZONE = 'America/New_York';

module.exports = {
  TARGET_CITIES,
  SW_MICHIGAN_CITIES,
  TARGET_TITLES,
  TARGET_INDUSTRIES,
  SHEET_COLUMNS,
  MAX_LEADS_PER_RUN,
  CRON_SCHEDULE,
  CRON_TIMEZONE,
};
