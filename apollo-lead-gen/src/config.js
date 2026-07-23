'use strict';

// ─── Target geography ────────────────────────────────────────────────────────
// Add or remove cities here to change the search area.
// Format: "City, Michigan, United States"
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  'Holland, Michigan, United States',
  'Grand Haven, Michigan, United States',
  'Muskegon, Michigan, United States',
  'South Haven, Michigan, United States',
];

// ─── Target industries ────────────────────────────────────────────────────────
// Apollo keyword tags — adjust to broaden or narrow industry scope.
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating and Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
];

// ─── Decision-maker titles (priority order) ───────────────────────────────────
// Apollo matches these in order; contacts with earlier titles appear first.
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
];

// ─── Sheet column layout ──────────────────────────────────────────────────────
// Change the order or add columns here — update COLUMN_MAP to match.
const SHEET_HEADERS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',   // left blank for manual use
  'Notes',    // left blank for manual use
];

// Maps data fields → zero-based column indices (must match SHEET_HEADERS).
const COLUMN_MAP = {
  dateAdded:    0,
  businessName: 1,
  firstName:    2,
  lastName:     3,
  phone:        4,
  city:         5,
  website:      6,
  // columns 7 (Called) and 8 (Notes) are left blank on insert
};

module.exports = {
  SW_MICHIGAN_CITIES,
  TARGET_INDUSTRIES,
  TARGET_TITLES,
  SHEET_HEADERS,
  COLUMN_MAP,
};
