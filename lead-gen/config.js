'use strict';

// ─── Edit these to change your search targets ───────────────────────────────

// Southwest Michigan cities. Apollo accepts "City, State, Country" format.
// Add or remove cities here — no other code needs to change.
const CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// Apollo industry/keyword tags. Apollo matches these against company descriptions.
const INDUSTRIES = [
  'hvac',
  'heating and air conditioning',
  'plumbing',
  'mechanical contracting',
];

// Job titles in priority order. Apollo returns results in its own ranking order;
// the priority here is applied when we have more results than MAX_LEADS_PER_RUN.
const JOB_TITLE_PRIORITY = ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'];

// Apollo employee count ranges: "min,max" strings (inclusive).
// Covers 1–25 employees (owner-operated small businesses).
const EMPLOYEE_RANGES = ['1,10', '11,25'];

// Maximum new leads to add per scheduled run.
const MAX_LEADS_PER_RUN = 25;

// ─── Google Sheet column structure ──────────────────────────────────────────
// Must match the order of values written in sheets.js appendLeads().
// Add columns at the end; inserting in the middle requires updating sheets.js too.
const SHEET_COLUMNS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',   // left blank — you fill in manually
  'Notes',    // left blank — you fill in manually
];

// Name of the tab inside your Google Sheet
const SHEET_TAB = 'Leads';

module.exports = {
  CITIES,
  INDUSTRIES,
  JOB_TITLE_PRIORITY,
  EMPLOYEE_RANGES,
  MAX_LEADS_PER_RUN,
  SHEET_COLUMNS,
  SHEET_TAB,
};
