'use strict';

// ─── All configurable values live here ───────────────────────────────────────
// Edit this file to change cities, industries, job titles, or schedule.

module.exports = {
  // Southwest Michigan cities to search — add or remove freely
  CITIES: [
    'St. Joseph',
    'Benton Harbor',
    'Kalamazoo',
    'Holland',
    'Grand Haven',
    'Muskegon',
    'South Haven',
  ],

  STATE:   'Michigan',
  COUNTRY: 'United States',

  // Apollo.io industry strings — matches Apollo's own industry taxonomy
  INDUSTRIES: [
    'HVAC',
    'Heating, Ventilation and Air Conditioning',
    'Plumbing',
    'Mechanical or Industrial Engineering',
    'Construction',
  ],

  // Job titles to target — order here is for readability; Apollo searches all simultaneously
  // Edit this list to widen or narrow decision-maker targeting
  JOB_TITLES: [
    'Owner',
    'President',
    'Founder',
    'Co-Founder',
    'General Manager',
  ],

  // Company size filter — 1–25 employees = owner-operated small businesses
  MIN_EMPLOYEES: 1,
  MAX_EMPLOYEES: 25,

  // Hard cap on new leads added per scheduled run (keeps the list manageable)
  MAX_LEADS_PER_RUN: 25,

  // Cron expression: 7:00 AM daily  (minute hour day month weekday)
  CRON_SCHEDULE: '0 7 * * *',
  TIMEZONE: 'America/New_York',

  // Google Sheet column headers — order matches columns A through I
  // If you rename or reorder these, update the row-builder in sheets.js too
  SHEET_HEADERS: [
    'Date Added',
    'Business Name',
    'Owner First Name',
    'Owner Last Name',
    'Phone Number',
    'City',
    'Website',
    'Called',
    'Notes',
  ],

  // Sheet tab name — overridden by SHEET_TAB_NAME env var at runtime
  get SHEET_TAB_NAME() {
    return process.env.SHEET_TAB_NAME || 'Sheet1';
  },
};
