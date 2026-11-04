'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// ─── Target geography ────────────────────────────────────────────────────────
// Add or remove cities here — the workflow searches each one on every run.
const TARGET_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// ─── Broad location filter sent to Apollo ────────────────────────────────────
const APOLLO_LOCATION = 'Michigan, United States';

// ─── Industries (Apollo keyword tags) ────────────────────────────────────────
// Apollo uses free-text industry keywords rather than numeric IDs for people search.
const APOLLO_INDUSTRIES = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
];

// ─── Decision-maker titles, highest priority first ───────────────────────────
// Apollo will return all titles; we sort results by this order when multiple
// contacts are returned for the same company.
const TARGET_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'general manager',
];

// ─── Company size range ───────────────────────────────────────────────────────
const EMPLOYEE_RANGE = '1,25'; // "1,25" = 1–25 employees in Apollo's range syntax

// ─── Sheet column order ───────────────────────────────────────────────────────
// Change the ORDER here to rearrange columns in your spreadsheet.
// Do NOT remove entries — the code references them by name.
const SHEET_COLUMNS = [
  'Date Added',      // A
  'Business Name',   // B
  'Owner First Name', // C
  'Owner Last Name',  // D
  'Phone Number',    // E
  'City',            // F
  'Website',         // G
  'Called',          // H — left blank, filled manually
  'Notes',           // I — left blank, filled manually
];

// ─── Scheduling ───────────────────────────────────────────────────────────────
// 7:00 AM Eastern Time (UTC-5 standard, UTC-4 daylight saving)
// node-cron runs in the server's local timezone; TZ=America/New_York handles DST.
const CRON_SCHEDULE = '0 7 * * *'; // every day at 07:00 in TZ=America/New_York
const CRON_TIMEZONE = 'America/New_York';

// ─── Limits ───────────────────────────────────────────────────────────────────
const MAX_LEADS_PER_RUN = parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10);

// ─── Required env vars ────────────────────────────────────────────────────────
const REQUIRED_VARS = ['APOLLO_API_KEY', 'GOOGLE_SHEET_ID'];

function validateEnv() {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = {
  TARGET_CITIES,
  APOLLO_LOCATION,
  APOLLO_INDUSTRIES,
  TARGET_TITLES,
  EMPLOYEE_RANGE,
  SHEET_COLUMNS,
  CRON_SCHEDULE,
  CRON_TIMEZONE,
  MAX_LEADS_PER_RUN,
  validateEnv,
  APOLLO_API_KEY: () => process.env.APOLLO_API_KEY,
  GOOGLE_SHEET_ID: () => process.env.GOOGLE_SHEET_ID,
  GOOGLE_CREDENTIALS_PATH: () =>
    process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json',
  GOOGLE_TOKEN_PATH: () => process.env.GOOGLE_TOKEN_PATH || './google-token.json',
  NOTIFICATION_EMAIL: () => process.env.NOTIFICATION_EMAIL || '',
};
