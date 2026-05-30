'use strict';

// ─── EDIT THESE to customise the workflow ────────────────────────────────────

const TARGET_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Apollo keyword tags — matches company industry labels
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
];

// Decision-maker titles in priority order (Owner first)
const JOB_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Apollo employee range filter
const EMPLOYEE_RANGE = '1,25';

// Max leads written per scheduled run
const MAX_LEADS_PER_RUN = 25;

// Google Sheets column order — change only if you also update src/sheets.js#buildRow
const SHEET_HEADERS = [
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

// ─── Internal / scheduling ────────────────────────────────────────────────────

// node-cron expression for 7:00 AM Eastern every day.
// The timezone option passed to cron.schedule() handles DST automatically.
const CRON_SCHEDULE = '0 7 * * *';
const CRON_TIMEZONE = 'America/New_York';

module.exports = {
  TARGET_CITIES,
  INDUSTRY_KEYWORDS,
  JOB_TITLES,
  EMPLOYEE_RANGE,
  MAX_LEADS_PER_RUN,
  SHEET_HEADERS,
  CRON_SCHEDULE,
  CRON_TIMEZONE,
};
