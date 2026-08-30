'use strict';
require('dotenv').config();

// ─── Target Cities ────────────────────────────────────────────────────────────
// Add or remove cities here to change the search geography.
// Apollo searches by city name + state; all must be in Michigan.
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
];

// ─── Industry Keywords ────────────────────────────────────────────────────────
// These are sent as keyword tags to Apollo.  Add synonyms if you want broader
// coverage (e.g. "air conditioning", "heat pump").
const INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Heating',
  'Air Conditioning',
];

// ─── Job Titles ───────────────────────────────────────────────────────────────
// Apollo returns the first matching title per contact.  Order matters —
// "Owner" is checked before "President", etc.
const JOB_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ─── Sheet Column Order ───────────────────────────────────────────────────────
// Must match the header row in your Google Sheet exactly (case-sensitive).
// Change only if you rename columns in the sheet.
const SHEET_COLUMNS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',
  'Notes',
];

// ─── Apollo Company Size Filter ───────────────────────────────────────────────
// "1,25" means 1–25 employees.  Apollo accepts comma-separated min,max pairs.
const EMPLOYEE_RANGE = '1,25';

// ─── Runtime Config (read from .env) ─────────────────────────────────────────
module.exports = {
  TARGET_CITIES,
  INDUSTRIES,
  JOB_TITLES,
  SHEET_COLUMNS,
  EMPLOYEE_RANGE,

  apolloApiKey: process.env.APOLLO_API_KEY,
  sheetId: process.env.GOOGLE_SHEET_ID,
  sheetTab: process.env.GOOGLE_SHEET_TAB || 'Sheet1',
  credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials/service-account.json',

  notifyEmail: process.env.NOTIFY_EMAIL,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,

  maxLeadsPerRun: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  cronSchedule: process.env.CRON_SCHEDULE || '0 7 * * *',
  timezone: process.env.TIMEZONE || 'America/New_York',
};
