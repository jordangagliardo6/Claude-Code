'use strict';

// ─── Target cities ────────────────────────────────────────────────────────────
// Edit this list to change or expand the search geography.
// Apollo accepts city-level strings in the format "City, State, Country".
const CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// ─── Job titles ───────────────────────────────────────────────────────────────
// Apollo scores title matches in the order they appear; keeping the highest-value
// decision-makers first produces the best results on paid plans.
const TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ─── Industry keywords ────────────────────────────────────────────────────────
// Used as a keyword query to bias results toward HVAC / trades companies.
// Apollo will also apply its own industry-tag matching on top of this.
const INDUSTRY_KEYWORDS = [
  'HVAC',
  'heating',
  'air conditioning',
  'plumbing',
  'mechanical contracting',
  'furnace',
  'cooling',
];

// ─── Company size ─────────────────────────────────────────────────────────────
// Apollo employee-range format: "min,max" strings.
// "1,10"  = 1–10 employees
// "11,25" = 11–25 employees  (Apollo accepts custom ranges on most plans)
// If your Apollo plan doesn't recognise "11,25", change to "11,20" or "21,50".
const EMPLOYEE_RANGES = ['1,10', '11,25'];

// ─── Column order in the spreadsheet ─────────────────────────────────────────
// Reorder or rename here to update both the header row and the data rows.
const SPREADSHEET_COLUMNS = [
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

const SHEET_TAB = 'Leads'; // Name of the tab inside the spreadsheet

module.exports = {
  CITIES,
  TITLES,
  INDUSTRY_KEYWORDS,
  EMPLOYEE_RANGES,
  SPREADSHEET_COLUMNS,
  SHEET_TAB,
};
