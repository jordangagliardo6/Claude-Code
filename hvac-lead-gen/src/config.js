'use strict';
require('dotenv').config();

// ─── Target cities — edit this list freely ───────────────────────────────────
const TARGET_CITIES = [
  'St. Joseph, MI',
  'Saint Joseph, MI',
  'Benton Harbor, MI',
  'Kalamazoo, MI',
  'Holland, MI',
  'Grand Haven, MI',
  'Muskegon, MI',
  'South Haven, MI',
];

// Additional broad location filter passed to Apollo
const TARGET_LOCATIONS = ['Michigan, United States'];

// ─── Apollo search filters ────────────────────────────────────────────────────
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
  'heating',
  'cooling',
  'air conditioning',
];

// Apollo employee range format: 'min,max'
const EMPLOYEE_RANGES = ['1,10', '11,25'];

// Job titles in priority order — Apollo will match any of these
const TARGET_JOB_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ─── Spreadsheet settings ─────────────────────────────────────────────────────
// Column order must match the header row in your spreadsheet
const SHEET_COLUMNS = [
  'Date Added',       // A
  'Business Name',    // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',     // E
  'City',             // F
  'Website',          // G
  'Called',           // H — left blank
  'Notes',            // I — left blank
];

// Which column to check for duplicates (0-indexed within SHEET_COLUMNS)
const DEDUP_COLUMN_INDEX = 1; // 'Business Name'

module.exports = {
  TARGET_CITIES,
  TARGET_LOCATIONS,
  INDUSTRY_KEYWORDS,
  EMPLOYEE_RANGES,
  TARGET_JOB_TITLES,
  SHEET_COLUMNS,
  DEDUP_COLUMN_INDEX,

  // Runtime values from .env
  APOLLO_API_KEY: process.env.APOLLO_API_KEY,
  SPREADSHEET_ID: process.env.SPREADSHEET_ID || '1IGu3eIM6shnjmlTpD0K65Fud_4XPvIb1RRclpAgl_NU',
  SHEET_TAB_NAME: process.env.SHEET_TAB_NAME || 'Sheet1',
  MAX_LEADS_PER_RUN: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || '0 7 * * *',

  NOTIFY_EMAIL_TO: process.env.NOTIFY_EMAIL_TO,
  NOTIFY_EMAIL_FROM: process.env.NOTIFY_EMAIL_FROM,
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,

  GOOGLE_SERVICE_ACCOUNT_KEY_FILE: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './google-service-account.json',
  GOOGLE_SERVICE_ACCOUNT_KEY_BASE64: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64,
};
