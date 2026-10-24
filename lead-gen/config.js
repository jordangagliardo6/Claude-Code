/**
 * config.js
 * Central configuration for the HVAC lead generation workflow.
 * Edit CITIES, INDUSTRIES, or TARGET_TITLES to customize targeting.
 */

require('dotenv').config();

// Southwest Michigan cities to target — add or remove as needed
const CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  'Holland, Michigan',
  'Grand Haven, Michigan',
  'Muskegon, Michigan',
  'South Haven, Michigan',
];

// Industry keywords sent to Apollo's keyword filter
const INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  'Heating Ventilation',
  'Air Conditioning',
  'Refrigeration',
];

// Job titles to target, checked in priority order
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// Column order in the Google Sheet — change labels here if needed
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

// Column index (0-based) used for duplicate detection
const DUPLICATE_CHECK_COLUMN = 'Business Name';

module.exports = {
  APOLLO_API_KEY: process.env.APOLLO_API_KEY,
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  GOOGLE_SHEET_TAB_NAME: process.env.GOOGLE_SHEET_TAB_NAME || 'Leads',
  GOOGLE_CREDENTIALS_FILE: process.env.GOOGLE_CREDENTIALS_FILE || './google-credentials.json',
  GOOGLE_CREDENTIALS_JSON: process.env.GOOGLE_CREDENTIALS_JSON,
  NOTIFICATION_EMAIL: process.env.NOTIFICATION_EMAIL,
  MAX_LEADS_PER_RUN: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  SCHEDULER_TIMEZONE: process.env.SCHEDULER_TIMEZONE || 'America/New_York',
  CITIES,
  INDUSTRIES,
  TARGET_TITLES,
  SHEET_COLUMNS,
  DUPLICATE_CHECK_COLUMN,
};
