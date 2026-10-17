/**
 * Search configuration — edit these to change target cities, industries, or job titles.
 * All values are passed directly to the Apollo.io People Search API.
 */

const SOUTHWEST_MICHIGAN_CITIES = [
  "St. Joseph, Michigan",
  "Benton Harbor, Michigan",
  "Kalamazoo, Michigan",
  "Holland, Michigan",
  "Grand Haven, Michigan",
  "Muskegon, Michigan",
  "South Haven, Michigan",
];

// Apollo uses zip-code or city strings in person_locations
const LOCATION_FILTERS = [
  "St. Joseph, Michigan, United States",
  "Benton Harbor, Michigan, United States",
  "Kalamazoo, Michigan, United States",
  "Holland, Michigan, United States",
  "Grand Haven, Michigan, United States",
  "Muskegon, Michigan, United States",
  "South Haven, Michigan, United States",
  // Broader state filter as fallback — Apollo will bias SW Michigan by zip proximity
  "Michigan, United States",
];

// Matching Apollo industry/keyword values — edit to expand or narrow scope
const TARGET_INDUSTRIES = [
  "hvac",
  "heating and air conditioning",
  "plumbing",
  "mechanical contracting",
];

// Job titles in priority order — Apollo will return contacts matching any of these
const TARGET_JOB_TITLES = [
  "owner",
  "president",
  "founder",
  "co-founder",
  "general manager",
];

// Company size range: 1–25 employees (owner-operated small businesses)
const EMPLOYEE_RANGE = "1,25";

// Columns written to Google Sheets, in order
// DO NOT reorder without also updating the sheet and the row-builder in leadgen.js
const SHEET_COLUMNS = [
  "Date Added",       // A
  "Business Name",    // B  ← used for duplicate checks
  "Owner First Name", // C
  "Owner Last Name",  // D
  "Phone Number",     // E
  "City",             // F
  "Website",          // G
  "Called",           // H  (left blank — you fill this)
  "Notes",            // I  (left blank — you fill this)
];

module.exports = {
  SOUTHWEST_MICHIGAN_CITIES,
  LOCATION_FILTERS,
  TARGET_INDUSTRIES,
  TARGET_JOB_TITLES,
  EMPLOYEE_RANGE,
  SHEET_COLUMNS,
};
