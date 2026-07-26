'use strict';

// ─── SEARCH CONFIG ─────────────────────────────────────────────────────────────
// Edit these arrays to change your target area, industries, or decision-maker titles.
// Changes here take effect on the next run — no other code needs to be touched.

const CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Short city names used for keyword search and city matching
const CITY_NAMES = CITIES.map(c => c.split(',')[0].trim());

const INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Heating & Cooling',
  'Air Conditioning',
];

// Apollo will also match similar titles (e.g. "Co-Owner", "Managing Partner")
const JOB_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Google Sheets column headers — edit the order here if you rearrange columns
// WARNING: if you add or remove columns you must also update src/sheets.js → buildRow()
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

const SHEET_TAB = 'Leads';

module.exports = {
  CITIES,
  CITY_NAMES,
  INDUSTRIES,
  JOB_TITLES,
  SHEET_COLUMNS,
  SHEET_TAB,
  STATE: 'Michigan, United States',
  EMPLOYEE_RANGE: '1,25',
  MAX_LEADS_PER_RUN: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  TIMEZONE: process.env.TIMEZONE || 'America/New_York',
  // 7:00 AM every day
  CRON_SCHEDULE: '0 7 * * *',
};
